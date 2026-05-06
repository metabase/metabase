import MetabaseSettings from "metabase/utils/settings";
import type { QuestionCreatorOpts } from "metabase-lib/v1/Question";
import Question from "metabase-lib/v1/Question";
import type {
  CardId,
  Card as SavedCard,
  UnsavedCard,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

import { card as urlForCard } from "./cards";

type QuestionUrlBuilderOpts = {
  originalQuestion?: Question;
  query?: Record<string, any>;
  creationType?: string;
};

export function question(
  question: Question,
  { originalQuestion, query, creationType }: QuestionUrlBuilderOpts = {},
) {
  const isDirty =
    originalQuestion != null && question.isDirtyComparedTo(originalQuestion);

  return urlForCard(question.cardWithNormalizedQuery(), {
    query,
    creationType,
    parameterValues: question._parameterValues,
    includeDisplayIsLocked: true,
    // dirty questions should always render as unsaved
    forceUnsaved: isDirty,
  });
}

export function serializedQuestion(card: SavedCard | UnsavedCard, opts = {}) {
  return urlForCard(card, { ...opts, forceUnsaved: true });
}

type NewQuestionUrlBuilderParams = QuestionCreatorOpts & {
  mode?: "view" | "notebook" | "query" | "ask";
  creationType?: string;
  objectId?: number | string;
};

export function newQuestion({
  mode,
  creationType,
  objectId,
  ...options
}: NewQuestionUrlBuilderParams) {
  if (mode === "ask") {
    return `/question/ask`;
  }

  const q = Question.create(options);
  const url = question(q, {
    creationType,
    query: objectId === undefined ? {} : { objectId },
  });
  const type = q.type();

  if (mode) {
    const pathType = type === "metric" ? "question" : type;
    return url.replace(/^\/(question|model|metric)/, `/${pathType}\/${mode}`);
  }

  return url;
}

export function publicQuestion({
  uuid,
  type = null,
  query,
  includeSiteUrl = true,
}: {
  uuid: string;
  type?: string | null;
  query?: string;
  includeSiteUrl?: boolean;
}) {
  const siteUrl = includeSiteUrl ? MetabaseSettings.get("site-url") : "";
  const searchQuery = query ? `?${query}` : "";
  return (
    `${siteUrl}/public/question/${uuid}` +
    (type ? `.${type}` : "") +
    searchQuery
  );
}

export function embedCard(token: EntityToken, type: string | null = null) {
  return `/embed/question/${token}` + (type ? `.${type}` : ``);
}

export function tableRowsQuery(
  databaseId: number | string,
  tableId: number | string,
  metricId?: number | string,
  segmentId?: number | string,
) {
  let query = `?db=${databaseId}&table=${tableId}`;

  if (metricId) {
    query += `&metric=${metricId}`;
  }

  if (segmentId) {
    query += `&segment=${segmentId}`;
  }

  // QB parses this querystring-in-hash to build an ad-hoc question — confusing, but load-bearing.
  return `/question#${query}`;
}

export function xrayModel(id: CardId) {
  return `/auto/dashboard/model/${id}`;
}
