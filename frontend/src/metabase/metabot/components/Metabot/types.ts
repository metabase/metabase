import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";

export interface QueryResults {
  prompt: string;
  question: Question;
  results: [Dataset];
}
