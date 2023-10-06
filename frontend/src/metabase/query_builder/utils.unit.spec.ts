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

const modelLocation = createMockLocation({
  pathname: `/model/${mockModelCard.id}`,
});

describe("isNavigationAllowed", () => {
  it("always allows navigation for new questions", () => {
    const isNewQuestion = true;
    const questions = [...mockQuestions, undefined];
    const destinations = [anyLocation, modelLocation, undefined];

    for (const question of questions) {
      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    }
  });

  it("always allows navigation when there is no destination (i.e. it's an beforeunload event)", () => {
    const destination = undefined;
    const questions = [...mockQuestions, undefined];

    for (const question of questions) {
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: true }),
      ).toBe(true);

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: false }),
      ).toBe(true);
    }
  });
});
