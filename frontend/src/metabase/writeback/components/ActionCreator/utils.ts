import Question from "metabase-lib/lib/Question";

export const newQuestion = (metadata: any) => {
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
