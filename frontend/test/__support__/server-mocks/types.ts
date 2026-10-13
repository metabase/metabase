import type { CallLog } from "fetch-mock";

/** A static mock response, or a callback that answers each call, optionally later. */
export type MockResponse<T> = T | ((call: CallLog) => T | Promise<T>);
