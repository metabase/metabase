import { createMockCard } from "metabase-types/api/mocks";
import Question from "metabase-lib/Question";
import { isQuestionEdited } from "./utils";

const MODEL = new Question(createMockCard({ id: 1, dataset: true }));
const SAVED_QUESTION = new Question(createMockCard({ id: 2 }));
const UNSAVED_QUESTION = new Question(createMockCard({ id: undefined }));

describe("isQuestionEdited", () => {
  it("returns true if question is not saved and originalQuestion is not dataset", () => {
    expect(isQuestionEdited(UNSAVED_QUESTION, SAVED_QUESTION)).toBe(true);
  });

  it("returns false if question is saved", () => {
    expect(isQuestionEdited(SAVED_QUESTION, SAVED_QUESTION)).toBe(false);
  });

  it("returns false if originalQuestion is for a model", () => {
    expect(isQuestionEdited(UNSAVED_QUESTION, MODEL)).toBe(false);
  });

  it("returns false if question is null", () => {
    expect(isQuestionEdited(null, SAVED_QUESTION)).toBe(false);
  });

  it("returns false if originalQuestion is null", () => {
    expect(isQuestionEdited(UNSAVED_QUESTION, null)).toBe(false);
  });
});
