import type { CallLog } from "fetch-mock";

export type MockResponse<T> = T | ((call: CallLog) => T | Promise<T>);
