import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import type { CreateQuestionOptions } from "./types";
import {
  createQuestion,
  getInitialValues,
  getPlaceholder,
  getTitle,
} from "./util";

const mockCard = createMockCard({
  id: 1,
  name: "Test Question",
  description: "Test Description",
  collection_id: 1,
  type: "question",
});

const mockOriginalCard = createMockCard({
  id: 2,
  name: "Original Question",
  description: "Original Description",
  collection_id: 2,
  type: "question",
});

const mockQuestion = new Question(mockCard);
const mockOriginalQuestion = new Question(mockOriginalCard);

describe("SaveQuestionForm utils", () => {
  describe("createQuestion", () => {
    const baseCreateOptions: CreateQuestionOptions = {
      details: {
        saveType: "create",
        name: "New Question",
        description: "New Description",
        collection_id: 1,
        dashboard_id: null,
        dashboard_tab_id: undefined,
      },
      question: mockQuestion,
      onCreate: jest.fn(),
    };

    it("should override question data with details", async () => {
      const onCreateSpy = jest.fn();

      await createQuestion({
        ...baseCreateOptions,
        onCreate: onCreateSpy,
      });

      const call = onCreateSpy.mock.calls[0][0];

      expect(call).toEqual(
        expect.objectContaining({
          _card: expect.objectContaining({
            name: "New Question",
            description: "New Description",
          }),
        }),
      );
    });

    it("should trim whitespace from name and description", async () => {
      const onCreateSpy = jest.fn();
      const options = {
        ...baseCreateOptions,
        details: {
          ...baseCreateOptions.details,
          name: "  Trimmed Name  ",
          description: "  Trimmed Description  ",
        },
        onCreate: onCreateSpy,
      };

      await createQuestion(options);

      const call = onCreateSpy.mock.calls[0][0];

      expect(call).toEqual(
        expect.objectContaining({
          _card: expect.objectContaining({
            name: "Trimmed Name",
            description: "Trimmed Description",
          }),
        }),
      );
    });

    it("should set description to null if it's empty after trimming", async () => {
      const onCreateSpy = jest.fn();
      const options = {
        ...baseCreateOptions,
        details: {
          ...baseCreateOptions.details,
          description: "   ", // whitespace only
        },
        onCreate: onCreateSpy,
      };
      await createQuestion(options);

      const call = onCreateSpy.mock.calls[0][0];
      expect(call._card.description).toBe(null);
    });

    it("should handle actual null descriptions", async () => {
      const onCreateSpy = jest.fn();
      const options = {
        ...baseCreateOptions,
        details: {
          ...baseCreateOptions.details,
          description: null as unknown as string, // testing invalid type
        },
        onCreate: onCreateSpy,
      };
      await createQuestion(options);

      const call = onCreateSpy.mock.calls[0][0];
      expect(call._card.description).toBe(null);
    });

    it("should use targetCollection when provided", async () => {
      const onCreateSpy = jest.fn();
      const options = {
        ...baseCreateOptions,
        targetCollection: 5,
        onCreate: onCreateSpy,
      };

      await createQuestion(options);
      const call = onCreateSpy.mock.calls[0][0];

      expect(call._card.collection_id).toBe(5);
    });
  });

  describe("getInitialValues", () => {
    it("should return correct initial values for a new question", () => {
      const result = getInitialValues(null, mockQuestion, 1, null);

      expect(result).toEqual({
        name: "Test Question",
        description: "Test Description",
        collection_id: 1,
        dashboard_id: null,
        dashboard_tab_id: undefined,
        saveType: "create",
      });
    });

    it("should return modified name for existing question", () => {
      const result = getInitialValues(
        mockOriginalQuestion,
        mockQuestion,
        1,
        null,
      );

      expect(result.name).toBe("Original Question - Modified");
      expect(result.saveType).toBe("overwrite");
    });
  });

  describe("getTitle", () => {
    it("should return correct title for question single step with save type", () => {
      expect(getTitle("question", true, false)).toBe("Save question");
    });

    it("should return correct title for question single step without save type", () => {
      expect(getTitle("question", false, false)).toBe("Save new question");
    });

    it("should return correct title for question multi step", () => {
      expect(getTitle("question", true, true)).toBe(
        "First, save your question",
      );
      expect(getTitle("question", false, true)).toBe(
        "First, save your question",
      );
    });

    it("should return correct title for model single step", () => {
      expect(getTitle("model", true, false)).toBe("Save model");
      expect(getTitle("model", false, false)).toBe("Save model");
    });

    it("should return correct title for model multi step", () => {
      expect(getTitle("model", true, true)).toBe("First, save your model");
      expect(getTitle("model", false, true)).toBe("First, save your model");
    });

    it("should return correct title for metric single step", () => {
      expect(getTitle("metric", true, false)).toBe("Save metric");
      expect(getTitle("metric", false, false)).toBe("Save metric");
    });

    it("should return correct title for metric multi step", () => {
      expect(getTitle("metric", true, true)).toBe("First, save your metric");
      expect(getTitle("metric", false, true)).toBe("First, save your metric");
    });
  });

  describe("getPlaceholder", () => {
    it("should return correct placeholder for question", () => {
      expect(getPlaceholder("question")).toBe(
        "What is the name of your question?",
      );
    });

    it("should return correct placeholder for model", () => {
      expect(getPlaceholder("model")).toBe("What is the name of your model?");
    });

    it("should return correct placeholder for metric", () => {
      expect(getPlaceholder("metric")).toBe("What is the name of your metric?");
    });
  });
});
