import type { MutableRefObject } from "react";

export type RefProp<RefValue> = {
  ref: MutableRefObject<RefValue> | ((value: RefValue) => void);
};
