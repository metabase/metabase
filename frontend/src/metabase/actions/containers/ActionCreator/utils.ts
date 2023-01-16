import type {
  WritebackQueryAction,
  VisualizationSettings,
} from "metabase-types/api";
import type {
  Card as LegacyCard,
  NativeDatasetQuery,
} from "metabase-types/types/Card";
import type Metadata from "metabase-lib/metadata/Metadata";
import Question from "metabase-lib/Question";

// ActionCreator uses the NativeQueryEditor, which expects a Question object
// This utilities help us to work with the WritebackQueryAction as with a Question

export const newQuestion = (metadata: Metadata, databaseId?: number) => {
  return new Question(
    {
      dataset_query: {
        type: "native",
        database: databaseId ?? null,
        native: {
          query: "",
        },
      },
    },
    metadata,
  );
};

export const convertActionToQuestionCard = (
  action: WritebackQueryAction,
): LegacyCard<NativeDatasetQuery> => {
  return {
    name: action.name,
    description: action.description,
    dataset_query: action.dataset_query as NativeDatasetQuery,
    display: "action",
    visualization_settings:
      action.visualization_settings as VisualizationSettings,
  };
};
