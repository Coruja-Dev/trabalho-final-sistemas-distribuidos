import express from 'express'
import { Job, JobType, GlobalState } from '../../shared/src/types'
import { hashData } from '../../shared/src/hash'

const app = express()
app.use(express.json())

const DISPATCHER_URL = process.env.DISPATCHER_URL ?? 'http://localhost:3000'
const PORT = process.env.PORT ?? 4000
const WORKER_ID = process.env.WORKER_ID ?? crypto.randomUUID()
const WORKER_URL = `http://${process.env.HOSTNAME}:${PORT}`

const processJob = async (job: Job, state: GlobalState): Promise<Partial<GlobalState>> => {
  await new Promise((r) => setTimeout(r, Math.random() * 1000 + 500))

  if (Math.random() < 0.1) {
    console.error(`Worker ${WORKER_ID} simulating crash on job ${job.id}`)
    await fetch(`${DISPATCHER_URL}/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, workerId: WORKER_ID }),
    })
    process.exit(1)
  }

  switch (job.jobType) {
    case JobType.INCREMENT:
      return { counter: state.counter + (job.payload.increment ?? 1) }
    case JobType.SET_MESSAGE:
      return { message: job.payload.message ?? state.message }
    case JobType.UPDATE_HASH:
      return { hash: hashData(state.counter, state.message) }
  }
}

app.post('/job', async (req, res) => {
  const job: Job = req.body
  const stateRes = await fetch(`${DISPATCHER_URL}/state`)
  const state: GlobalState = await stateRes.json()
  console.log(`Worker ${WORKER_ID} processing job ${job.id} type ${JobType[job.jobType]}`)
  res.json({ ok: true })
  const result = await processJob(job, state)
  await fetch(`${DISPATCHER_URL}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: job.id, workerId: WORKER_ID, result }),
  })
})

const register = async () => {
  try {
    await fetch(`${DISPATCHER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: WORKER_ID, url: WORKER_URL }),
    })
    console.log(`Worker ${WORKER_ID} registered`)
  } catch {
    console.error(`Worker ${WORKER_ID} could not reach dispatcher, retrying...`)
    setTimeout(register, 2000)
  }
}

setInterval(async () => {
  try {
    await fetch(`${DISPATCHER_URL}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: WORKER_ID }),
    })
  } catch {
    console.error(`Worker ${WORKER_ID} heartbeat failed`)
  }
}, 2000)

app.listen(PORT, async () => {
  console.log(`Worker ${WORKER_ID} running on port ${PORT}`)
  await register()
})
