import { createMockLocation } from "__support__/location";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";

import { isNavigationAllowed } from "./utils";

const mockCard = createMockCard({
  id: getNextId(),
});

const mockNativeCard = createMockCard({
  id: getNextId(),
  dataset_query: createMockNativeDatasetQuery(),
});

const mockModelCard = createMockCard({
  id: getNextId(),
  dataset: true,
});

const mockNativeModelCard = createMockCard({
  id: getNextId(),
  dataset: true,
  dataset_query: createMockNativeDatasetQuery(),
});

const mockCards = [
  mockCard,
  mockNativeCard,
  mockModelCard,
  mockNativeModelCard,
];

const metadata = createMockMetadata({ questions: mockCards });

const mockQuestion = checkNotNull(metadata.question(mockCard.id));

const mockNativeQuestion = checkNotNull(metadata.question(mockNativeCard.id));

const mockModelQuestion = checkNotNull(metadata.question(mockModelCard.id));

const mockNativeModelQuestion = checkNotNull(
  metadata.question(mockNativeModelCard.id),
);

const mockQuestions = [
  mockQuestion,
  mockNativeQuestion,
  mockModelQuestion,
  mockNativeModelQuestion,
];

const anyLocation = createMockLocation();

const mockModelQueryTabLocation = createMockLocation({
  pathname: `/model/${mockModelCard.id}/query`,
});

const mockModelMetadataTabLocation = createMockLocation({
  pathname: `/model/${mockModelCard.id}/metadata`,
});

const mockRunQuestionLocation = createMockLocation({
  pathname: "/question",
  hash: `#${window.btoa(JSON.stringify(mockNativeCard))}`,
});

const mockLocations = [
  anyLocation,
  mockModelQueryTabLocation,
  mockModelMetadataTabLocation,
  mockRunQuestionLocation,
];

describe("isNavigationAllowed", () => {
  describe("when there is no destination (i.e. it's a beforeunload event)", () => {
    const destination = undefined;
    const questions = [...mockQuestions, undefined];

    it("always allows navigating away from creating new question", () => {
      const isNewQuestion = true;

      for (const question of questions) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });

    it("always allows navigating away from editing question", () => {
      const isNewQuestion = false;

      for (const question of questions) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });
  });

  describe("when creating new question", () => {
    const isNewQuestion = true;

    it("always allows navigating away from creating new question", () => {
      const questions = [...mockQuestions, undefined];
      const destinations = [...mockLocations, undefined];

      for (const question of questions) {
        for (const destination of destinations) {
          expect(
            isNavigationAllowed({ destination, question, isNewQuestion }),
          ).toBe(true);
        }
      }
    });
  });

  describe("when editing notebook question", () => {
    const isNewQuestion = false;
    const question = mockQuestion;
    const destinations = [...mockLocations, undefined];

    it("always allows navigating away from editing notebook question", () => {
      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });
  });

  describe("when editing native question", () => {
    const isNewQuestion = false;
    const question = mockNativeQuestion;

    it("allows to run the question", () => {
      const destination = mockRunQuestionLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("disallows all other navigation", () => {
      const destination = anyLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(false);
    });
  });

  describe("when editing notebook model", () => {
    const isNewQuestion = false;
    const question = mockModelQuestion;

    it("allows navigating between model query & metadata tabs", () => {
      const destinations = [
        mockModelQueryTabLocation,
        mockModelMetadataTabLocation,
      ];

      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });

    it("disallows all other navigation", () => {
      const destination = anyLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(false);
    });
  });

  describe("when editing native-query model", () => {
    const isNewQuestion = false;
    const question = mockNativeModelQuestion;

    it("allows navigating between model query & metadata tabs", () => {
      const destinations = [
        mockModelQueryTabLocation,
        mockModelMetadataTabLocation,
      ];

      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });

    it("disallows all other navigation", () => {
      const destination = anyLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(false);
    });
  });
});
