import { t } from "ttag";

import { serializeCardForUrl } from "metabase/common/utils/card";
import { dayjs } from "metabase/dayjs";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  Field,
  NormalizedField,
  VisualizationDisplay,
} from "metabase-types/api";
import type { SegmentId } from "metabase-types/api/segment";
import type { TableId } from "metabase-types/api/table";

export const idsToObjectMap = <T extends { id: unknown }>(
  ids: ReadonlyArray<string | number>,
  objects: Record<string, T>,
): Record<string, T> =>
  ids
    .map((id) => objects[id])
    .reduce<Record<string, T>>(
      (map, object) => ({ ...map, [String(object.id)]: object }),
      {},
    );
// recursive freezing done by assoc here is too expensive
// hangs browser for large databases
// .reduce((map, object) => assoc(map, object.id, object), {});

export const filterUntouchedFields = (
  fields: Record<string, unknown>,
  entity: Record<string, unknown> = {},
): Record<string, unknown> =>
  Object.keys(fields)
    .filter((key) => fields[key] !== undefined && entity[key] !== fields[key])
    .reduce<Record<string, unknown>>(
      (map, key) => ({ ...map, [key]: fields[key] }),
      {},
    );

export const isEmptyObject = (object: object): boolean =>
  Object.keys(object).length === 0;

export interface GetQuestionArgs {
  tableId: TableId;
  metadataProvider: Lib.MetadataProvider;
  // the field to group by, when the caller has loaded it. Either shape a
  // caller holds works, since `Lib.fromLegacyColumn` reads both.
  breakoutField?: NormalizedField | Field;
  segmentId?: SegmentId;
  getCount?: boolean;
  visualization?: VisualizationDisplay;
}

export const getQuestion = ({
  tableId,
  metadataProvider,
  breakoutField,
  segmentId,
  getCount,
  visualization,
}: GetQuestionArgs): Card | undefined => {
  const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
  if (table == null) {
    return;
  }

  let query = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
  if (getCount) {
    query = Lib.aggregateByCount(query, -1);
  }

  if (breakoutField) {
    query = breakoutWithDefaultTemporalBucket(query, breakoutField);
  }

  if (segmentId) {
    query = filterBySegmentId(query, segmentId);
  }

  let question = Question.create({ dataset_query: Lib.toJsQuery(query) });
  if (visualization) {
    question = question.setDisplay(visualization);
  }

  return question.card();
};

function breakoutWithDefaultTemporalBucket(
  query: Lib.Query,
  field: NormalizedField | Field,
): Lib.Query {
  const stageIndex = -1;
  const column = Lib.fromLegacyColumn(query, stageIndex, field);

  if (!column) {
    return query;
  }

  const newColumn = Lib.withDefaultBucket(query, stageIndex, column);
  return Lib.replaceBreakouts(query, -1, newColumn);
}

function filterBySegmentId(query: Lib.Query, segmentId: SegmentId): Lib.Query {
  const stageIndex = -1;
  const segmentMetadata = Lib.segmentMetadata(query, segmentId);

  if (!segmentMetadata) {
    return query;
  }

  return Lib.filter(query, stageIndex, segmentMetadata);
}

export const getQuestionUrl = (getQuestionArgs: GetQuestionArgs): string => {
  const card = getQuestion(getQuestionArgs);
  return Urls.card(null, {
    hash: card ? serializeCardForUrl(card) : "",
  });
};

// little utility function to determine if we 'has' things, useful
// for handling entity empty states
export const has = (entity: unknown): boolean =>
  Array.isArray(entity) ? entity.length > 0 : Boolean(entity);

export const getDescription = (card: Card): string => {
  const timestamp = dayjs(card.created_at).fromNow();
  const author = card.creator?.common_name;
  return t`Created ${timestamp} by ${author}`;
};
