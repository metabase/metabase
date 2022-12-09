import Question from "metabase-lib/Question";
import type Metadata from "metabase-lib/metadata/Metadata";

export const newQuestion = (metadata: Metadata) => {
  return new Question(
    {
      dataset_query: {
        type: "native",
        database: null,
        native: {
          query: "",
        },
      },
    },
    metadata,
  );
};
