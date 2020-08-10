import { state } from "__support__/sample_dataset_fixture";

import { getMetadata } from "metabase/selectors/metadata";

describe("databasesList", () => {
  it("should filter out saved questions", () => {
    const metadata = getMetadata(state);
    const savedQuestionDb = {
      id: "saved-question-id",
      name: "Saved Questions",
      is_saved_questions: true,
    };
    metadata.databases[savedQuestionDb.id] = savedQuestionDb;

    expect(
      metadata.databasesList().find(d => d.name === "Saved Questions"),
    ).toEqual(savedQuestionDb);
    expect(
      metadata
        .databasesList({ savedQuestions: false })
        .find(d => d.name === "Saved Questions"),
    ).toBeUndefined();
  });
});
