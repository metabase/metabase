import slugg from "slugg";
import type { Card } from "metabase-types/api";
import { question, QuestionUrlBuilderParams } from "./questions";
import { appendSlug } from "./utils";

type CardOrSearchResult = Partial<Card> & {
  id?: number | string;
  card_id?: number | string;
  name?: string;
};

export function model(
  card: CardOrSearchResult,
  opts?: QuestionUrlBuilderParams,
) {
  return question(card, opts);
}

export function modelDetail(card: CardOrSearchResult, tab = "") {
  const baseUrl = `${model({ ...card, dataset: true })}/detail`;
  return tab ? `${baseUrl}/${tab}` : baseUrl;
}

type ModelEditorUrlBuilderOpts = {
  type?: "query" | "metadata";
};

export function modelEditor(
  model: CardOrSearchResult,
  { type = "query" }: ModelEditorUrlBuilderOpts = {},
) {
  const id = model.card_id ?? model.id;

  let basePath = `/model/${id}`;
  if (model.name) {
    basePath = appendSlug(basePath, slugg(model.name));
  }

  return `${basePath}/${type}`;
}
