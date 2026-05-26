import { hashData } from "./hash"
import { randomMessage } from "./messages"

export const increment = (globalState: GlobalState) => {
    return {
        ...globalState,
        counter: globalState.counter + Math.floor(Math.random() * (10 - 1 + 1)) + 1
    }
}

export const setMessage = (globalState: GlobalState) => {
    return {
        ...globalState,
        message: randomMessage()
    }
}

export const updateHash = (globalState: GlobalState) => {
    return {
        ...globalState,
        hash: hashData(globalState.counter, globalState.message)
    }
}

export const updateClock = (globalState: GlobalState, id: string, clockCounter: number) => {
    return {
        ...globalState,
        clock: {
            ...globalState.clock,
            [id]: clockCounter
        }
    }
}

export enum JobType {
    INCREMENT,
    SET_MESSAGE,
    UPDATE_HASH
}

export enum JobStatus {
    PENDING,
    ASSIGNED,
    COMPLETED,
    FAILED,
}

export type JobPayload = {
  increment?: number,
  message?: string,
}

export interface Worker {
    id: string,
    url: string,
    busy: boolean,
    lastHeartbeat: number,
}

export interface Job {
    id: string,
    workerId: string | null,
    jobType: JobType,
    jobStatus: JobStatus,
    payload: JobPayload,
    createdAt: number,
}

export interface GlobalState {
    counter: number,
    message: string,
    hash: string,
    clock: Record<string, number>,
}