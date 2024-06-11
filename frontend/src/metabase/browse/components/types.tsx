import type { MutableRefObject } from "react";

/** @template T: The type of the value the ref will hold */
export type RefProp<T> = { ref: MutableRefObject<T> | ((el: T) => void) };
