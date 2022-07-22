import {
  Card,
  SavedCard,
  UnsavedCard,
  StructuredDatasetQuery,
  NativeDatasetQuery,
} from "metabase-types/types/Card";

import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";

import Question from "./lib/Question";
import NativeQuery from "./lib/queries/NativeQuery";
import StructuredQuery from "./lib/queries/StructuredQuery";

type NativeSavedCard = SavedCard<NativeDatasetQuery>;
type NativeUnsavedCard = UnsavedCard<NativeDatasetQuery>;
type StructuredSavedCard = SavedCard<StructuredDatasetQuery>;
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
};

export function getQuestion(card: Partial<Card>) {
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

export function getCleanStructuredQuestion(
  card?: Partial<StructuredUnsavedCard>,
) {
  let question = getAdHocQuestion(card);
  if (question.query() instanceof StructuredQuery) {
    question = question.setQuery({});
  }
  return question;
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
