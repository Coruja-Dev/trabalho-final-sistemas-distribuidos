import { createHash } from "crypto"

export const hashData = (counter: number, message: string) => {
    return createHash("sha256")
        .update(`${counter}${message}`)
        .digest("hex")
}