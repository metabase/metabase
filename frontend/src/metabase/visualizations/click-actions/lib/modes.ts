import type Question from "metabase-lib/Question";
import { DefaultMode } from "../modes/DefaultMode";
import { Mode } from "../Mode";

export function getMode(question: Question): Mode | null {
  return new Mode(question, DefaultMode);
}
