import { Card } from "metabase-types/types/Card";
import { question, QuestionUrlBuilderParams } from "./questions";

export function model(card: Card, opts: QuestionUrlBuilderParams) {
  return question(card, opts);
}
