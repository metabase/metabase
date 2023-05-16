import {
  Card as SavedCard,
  NativeDatasetQuery,
  StructuredDatasetQuery,
  UnsavedCard,
} from "metabase-types/api";

import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";

import Question from "metabase-lib/Question";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

export type NativeSavedCard = SavedCard<NativeDatasetQuery>;
type NativeUnsavedCard = UnsavedCard<NativeDatasetQuery>;
export type StructuredSavedCard = SavedCard<StructuredDatasetQuery>;
type StructuredUnsavedCard = UnsavedCard<StructuredDatasetQuery>;

const BASE_GUI_QUESTION: StructuredUnsavedCard = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE?.id,
    query: {
      "source-table": ORDERS.id,
    },
  },
};

const BASE_NATIVE_QUESTION: NativeUnsavedCard = {
  display: "table",
  visualization_settings: {},
  dataset_query: {
    type: "native",
    database: SAMPLE_DATABASE?.id,
    native: {
      query: "select * from orders",
      "template-tags": {},
    },
  },
};

const SAVED_QUESTION = {
  id: 1,
  name: "Q1",
  description: "",
  collection_id: null,
  can_write: true,
  result_metadata: [],
};

function getQuestion(card: Partial<SavedCard>) {
  return new Question(
    {
      ...BASE_GUI_QUESTION,
      display: "table",
      visualization_settings: {},
      ...card,
    },
    metadata,
  );
}

export function getAdHocQuestion(card?: Partial<StructuredUnsavedCard>) {
  return getQuestion({ ...BASE_GUI_QUESTION, ...card });
}

export function getUnsavedNativeQuestion(card?: Partial<NativeUnsavedCard>) {
  return getQuestion({ ...BASE_NATIVE_QUESTION, ...card });
}

export function getCleanNativeQuestion(card?: Partial<NativeUnsavedCard>) {
  const question = getUnsavedNativeQuestion(card);
  const query = (question.query() as NativeQuery).setQueryText("");
  return question.setQuery(query);
}

export function getSavedStructuredQuestion(
  card?: Partial<StructuredSavedCard>,
) {
  return getQuestion({ ...BASE_GUI_QUESTION, ...SAVED_QUESTION, ...card });
}

export function getSavedNativeQuestion(card?: Partial<NativeSavedCard>) {
  return getQuestion({
    ...BASE_NATIVE_QUESTION,
    ...SAVED_QUESTION,
    ...card,
  });
}

export function getStructuredModel(
  card?: Omit<Partial<StructuredSavedCard>, "dataset">,
) {
  return getQuestion({
    ...BASE_GUI_QUESTION,
    ...SAVED_QUESTION,
    ...card,
    dataset: true,
  });
}

export function getNativeModel(
  card?: Omit<Partial<NativeSavedCard>, "dataset">,
) {
  return getQuestion({
    ...BASE_NATIVE_QUESTION,
    ...SAVED_QUESTION,
    ...card,
    dataset: true,
  });
}

export function getComposedModel(
  card?: Omit<Partial<StructuredSavedCard>, "dataset">,
) {
  const question = getStructuredModel(card).composeDataset();
  const query = question.query() as StructuredQuery;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  question._metadata.tables[query.sourceTableId()] = ORDERS;

  return question;
}
