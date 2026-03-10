import { trackSchemaEvent, trackSimpleEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NewQuestionSavedEvent } from "metabase-types/analytics";
import type { Card } from "metabase-types/api";

export const trackNewQuestionSaved = (
  draftQuestion: Question,
  createdQuestion: Question,
  isBasedOnExistingQuestion?: boolean,
) => {
  trackSchemaEvent("question", {
    event: "new_question_saved",
    question_id: createdQuestion.id(),
    database_id: createdQuestion.databaseId(),
    visualization_type: createdQuestion.display(),
    type: draftQuestion.creationType() as NewQuestionSavedEvent["type"],
    method: isBasedOnExistingQuestion ? "existing_question" : "from_scratch",
  });
};

export const trackTurnIntoModelClicked = (question: Question) => {
  trackSchemaEvent("question", {
    event: "turn_into_model_clicked",
    question_id: question.id(),
  });
};

export const trackNotebookNativePreviewShown = (
  question: Question,
  isShown?: boolean,
) => {
  trackSchemaEvent("question", {
    event: isShown
      ? "notebook_native_preview_shown"
      : "notebook_native_preview_hidden",
    // question_id is not nullable in the schema, and we cannot change it
    question_id: question.id() ?? 0,
  });
};

export const trackColumnCombineViaShortcut = (
  query: Lib.Query,
  question?: Question,
) => {
  trackSchemaEvent("question", {
    event: "column_combine_via_shortcut",
    custom_expressions_used: ["concat"],
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

export const trackColumnCombineViaPlusModal = (
  query: Lib.Query,
  question?: Question,
) => {
  trackSchemaEvent("question", {
    event: "column_combine_via_plus_modal",
    custom_expressions_used: ["concat"],
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

export const trackColumnExtractViaShortcut = (
  query: Lib.Query,
  stageIndex: number,
  extraction: Lib.ColumnExtraction,
  question?: Question,
) => {
  trackSchemaEvent("question", {
    event: "column_extract_via_shortcut",
    custom_expressions_used: Lib.functionsUsedByExtraction(
      query,
      stageIndex,
      extraction,
    ),
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

export const trackColumnExtractViaPlusModal = (
  query: Lib.Query,
  stageIndex: number,
  extraction: Lib.ColumnExtraction,
  question?: Question,
) => {
  trackSchemaEvent("question", {
    event: "column_extract_via_plus_modal",
    custom_expressions_used: Lib.functionsUsedByExtraction(
      query,
      stageIndex,
      extraction,
    ),
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

export const trackFirstNonTableChartGenerated = (card: Card) => {
  trackSimpleEvent({
    event: "chart_generated",
    event_detail: card.display,
  });
};

export const trackCardBookmarkAdded = (card: Card) => {
  trackSimpleEvent({
    event: "bookmark_added",
    event_detail: card.type,
    triggered_from: "qb_action_panel",
  });
};
