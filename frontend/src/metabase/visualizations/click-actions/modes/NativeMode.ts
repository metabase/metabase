import type { QueryMode } from "../types";
import { NativeQueryClickFallback } from "../actions/NativeQueryClickFallback";
import { DefaultMode } from "./DefaultMode";

export const NativeMode: QueryMode = {
  name: "native",
  drills: DefaultMode.drills,
  fallback: NativeQueryClickFallback,
};
