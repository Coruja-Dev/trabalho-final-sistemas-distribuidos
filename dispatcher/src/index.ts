import express from 'express'
import { randomMessage } from '../../shared/src/messages'
import {
  GlobalState,
  Job,
  JobStatus,
  JobType,
  JobPayload,
  Worker,
} from '../../shared/src/types'

const app = express()
app.use(express.json())

let globalState: GlobalState = {
  counter: 0,
  message: 'System initialized.',
  hash: '',
  clock: {},
}

const workers = new Map<string, Worker>()
const jobs = new Map<string, Job>()

let autoInterval: NodeJS.Timeout | null = null

const createJobPayload = (type: JobType): JobPayload => {
  switch (type) {
    case JobType.INCREMENT:
      return { increment: Math.floor(Math.random() * 10) + 1 }
    case JobType.SET_MESSAGE:
      return { message: randomMessage() }
    case JobType.UPDATE_HASH:
      return {}
  }
}

const createJob = (type: JobType): Job => ({
  id: crypto.randomUUID(),
  workerId: null,
  jobType: type,
  jobStatus: JobStatus.PENDING,
  payload: createJobPayload(type),
  createdAt: Date.now(),
})

const getAvailableWorker = (): Worker | undefined =>
  [...workers.values()].find((w) => !w.busy)

const pushJobToWorker = async (job: Job, worker: Worker) => {
  try {
    const res = await fetch(`${worker.url}/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    })
    if (!res.ok) throw new Error('Worker rejected job')
    job.workerId = worker.id
    job.jobStatus = JobStatus.ASSIGNED
    worker.busy = true
    console.log(`Job ${job.id} pushed to worker ${worker.id}`)
  } catch (err) {
    console.error(`Failed to push job to worker ${worker.id}`, err)
  }
}

const dispatchPending = async () => {
  const pending = [...jobs.values()].filter(
    (j) => j.jobStatus === JobStatus.PENDING
  )
  for (const job of pending) {
    const worker = getAvailableWorker()
    if (!worker) break
    await pushJobToWorker(job, worker)
  }
}

const HEARTBEAT_TIMEOUT = parseInt(process.env.HEARTBEAT_TIMEOUT ?? '5000')

setInterval(() => {
  const now = Date.now()
  for (const worker of workers.values()) {
    if (now - worker.lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.warn(`Worker ${worker.id} timed out, removing`)
      for (const job of jobs.values()) {
        if (job.workerId === worker.id && job.jobStatus === JobStatus.ASSIGNED) {
          console.warn(`Reassigning job ${job.id}`)
          job.jobStatus = JobStatus.PENDING
          job.workerId = null
        }
      }
      workers.delete(worker.id)
      dispatchPending()
    }
  }
}, 2000)

app.post('/register', (req, res) => {
  const { id, url } = req.body
  const worker: Worker = {
    id,
    url,
    busy: false,
    lastHeartbeat: Date.now(),
  }
  workers.set(id, worker)
  globalState.clock[id] = 0
  console.log(`Worker registered: ${id} at ${url}`)
  res.json({ ok: true })
  dispatchPending()
})

app.post('/heartbeat', (req, res) => {
  const { id } = req.body
  const worker = workers.get(id)
  if (!worker) return res.status(404).json({ error: 'Unknown worker' })
  worker.lastHeartbeat = Date.now()
  res.json({ ok: true })
})

app.post('/complete', (req, res) => {
  const { jobId, workerId, result } = req.body
  const job = jobs.get(jobId)
  const worker = workers.get(workerId)
  if (!job || !worker) return res.status(404).json({ error: 'Not found' })
  job.jobStatus = JobStatus.COMPLETED
  worker.busy = false
  globalState = { ...globalState, ...result }
  globalState.clock[workerId] = (globalState.clock[workerId] ?? 0) + 1
  console.log(`Job ${jobId} completed by worker ${workerId}`)
  console.log(`State:`, globalState)
  dispatchPending()
  res.json({ ok: true })
})

app.post('/fail', (req, res) => {
  const { jobId, workerId } = req.body
  const job = jobs.get(jobId)
  const worker = workers.get(workerId)
  if (job) {
    job.jobStatus = JobStatus.PENDING
    job.workerId = null
  }
  if (worker) worker.busy = false
  console.warn(`Job ${jobId} failed, requeueing`)
  dispatchPending()
  res.json({ ok: true })
})

app.post('/jobs', (req, res) => {
  const { type } = req.body
  if (!(type in JobType)) return res.status(400).json({ error: 'Invalid type' })
  const job = createJob(type as JobType)
  jobs.set(job.id, job)
  console.log(`Job created: ${job.id} type ${JobType[job.jobType]}`)
  dispatchPending()
  res.json(job)
})

app.post('/auto', (req, res) => {
  const { interval, steps } = req.body
  if (autoInterval) clearInterval(autoInterval)
  const types = [JobType.INCREMENT, JobType.SET_MESSAGE, JobType.UPDATE_HASH]
  let count = 0
  autoInterval = setInterval(() => {
    if (count >= steps) {
      clearInterval(autoInterval!)
      autoInterval = null
      return
    }
    const type = types[Math.floor(Math.random() * types.length)]
    const job = createJob(type)
    jobs.set(job.id, job)
    console.log(`Auto job ${count + 1}/${steps}: ${JobType[type]}`)
    dispatchPending()
    count++
  }, interval)
  res.json({ ok: true, interval, steps })
})

app.post('/auto/stop', (_req, res) => {
  if (autoInterval) clearInterval(autoInterval)
  autoInterval = null
  res.json({ ok: true })
})

app.get('/state', (_req, res) => res.json(globalState))
app.get('/jobs', (_req, res) => res.json([...jobs.values()]))
app.get('/workers', (_req, res) => res.json([...workers.values()]))

const PORT = process.env.DISPATCHER_PORT ?? 3000
app.listen(PORT, () => console.log(`Dispatcher running on port ${PORT}`))
