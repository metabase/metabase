import slugg from "slugg";

import type { Card } from "metabase-types/api";

import { exploreMetric } from "./metrics-explorer";
import type { QuestionUrlBuilderParams } from "./questions";
import { question } from "./questions";
import { appendSlug } from "./utils";

export type CardOrSearchResult = Partial<Card> & {
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

export function metric(card: CardOrSearchResult): string {
  const id = card.card_id ?? card.id;
  const numericId = typeof id === "number" ? id : parseInt(String(id), 10);
  if (!isNaN(numericId)) {
    return exploreMetric(numericId);
  }
  return question(card);
}

export function modelDetail(card: CardOrSearchResult, tab = "") {
  const baseUrl = `${model({ ...card, type: "model" })}/detail`;
  return tab ? `${baseUrl}/${tab}` : baseUrl;
}

type ModelEditorUrlBuilderOpts = {
  type?: "query" | "columns" | "metadata";
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
