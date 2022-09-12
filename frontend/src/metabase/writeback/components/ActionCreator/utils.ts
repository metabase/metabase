import Question from "metabase-lib/lib/Question";
import type Metadata from "metabase-lib/lib/metadata/Metadata";

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
