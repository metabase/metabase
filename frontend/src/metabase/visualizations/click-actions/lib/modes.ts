import type Question from "metabase-lib/Question";

import { Mode } from "../Mode";
import { DefaultMode } from "../modes/DefaultMode";

export function getMode(question: Question): Mode | null {
  return new Mode(question, DefaultMode);
}
