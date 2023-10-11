import { createMockLocation } from "__support__/location";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";

import { isNavigationAllowed } from "./utils";

const notebookCard = createMockCard({
  id: getNextId(),
  name: "notebook question",
});

const nativeCard = createMockCard({
  id: getNextId(),
  name: "native question",
  dataset_query: createMockNativeDatasetQuery(),
});

const notebookModelCard = createMockCard({
  id: getNextId(),
  name: "notebook model",
  dataset: true,
});

const nativeModelCard = createMockCard({
  id: getNextId(),
  name: "native model",
  dataset: true,
  dataset_query: createMockNativeDatasetQuery(),
});

const cards = [notebookCard, nativeCard, notebookModelCard, nativeModelCard];

const metadata = createMockMetadata({ questions: cards });

const notebookQuestion = checkNotNull(metadata.question(notebookCard.id));

const nativeQuestion = checkNotNull(metadata.question(nativeCard.id));

const notebookModelQuestion = checkNotNull(
  metadata.question(notebookModelCard.id),
);

const nativeModelQuestion = checkNotNull(metadata.question(nativeModelCard.id));

const questions = [
  notebookQuestion,
  nativeQuestion,
  notebookModelQuestion,
  nativeModelQuestion,
];

const anyLocation = createMockLocation({
  pathname: "/",
});

const newModelQueryTabLocation = createMockLocation({
  pathname: "/model/query",
});

const newModelMetadataTabLocation = createMockLocation({
  pathname: "/model/metadata",
});

const modelQueryTabLocation = createMockLocation({
  pathname: `/model/${notebookModelCard.id}/query`,
});

const modelMetadataTabLocation = createMockLocation({
  pathname: `/model/${notebookModelCard.id}/metadata`,
});

const runQuestionLocation = createMockLocation({
  pathname: "/question",
  hash: `#${window.btoa(JSON.stringify(nativeCard))}`,
});

const locations = [
  anyLocation,
  modelQueryTabLocation,
  modelMetadataTabLocation,
  runQuestionLocation,
];

describe("isNavigationAllowed", () => {
  describe("when there is no destination (i.e. it's a beforeunload event)", () => {
    const destination = undefined;

    it.each(questions)(
      "allows navigating away from creating new `$_card.name`",
      question => {
        const isNewQuestion = true;

        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      },
    );

    it.each(questions)(
      "allows navigating away from editing `$_card.name`",
      question => {
        const isNewQuestion = false;

        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      },
    );
  });

  describe("when there is no question", () => {
    const question = undefined;

    it.each(locations)("allows navigating away to `$pathname`", destination => {
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: true }),
      ).toBe(true);
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: false }),
      ).toBe(true);
    });
  });

  describe("when creating new question", () => {
    const isNewQuestion = true;

    describe("allows navigating away", () => {
      describe.each(locations)("to `$pathname`", destination => {
        it.each([notebookQuestion, nativeQuestion])(
          "from creating new `$_card.name`",
          question => {
            expect(
              isNavigationAllowed({ destination, question, isNewQuestion }),
            ).toBe(true);
          },
        );
      });
    });
  });

  describe("when editing notebook question", () => {
    const isNewQuestion = false;
    const question = notebookQuestion;

    it.each(locations)("allows navigating away to `$pathname`", destination => {
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });
  });

  describe("when editing native question", () => {
    const isNewQuestion = false;
    const question = nativeQuestion;

    it("allows to run the question", () => {
      const destination = runQuestionLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([anyLocation, modelQueryTabLocation, modelMetadataTabLocation])(
        "to `$pathname`",
        destination => {
          expect(
            isNavigationAllowed({ destination, question, isNewQuestion }),
          ).toBe(false);
        },
      );
    });
  });

  describe("when creating new model", () => {
    const isNewQuestion = true;
    const question = notebookModelQuestion;

    it("does not allow navigating away from creating new model", () => {
      const destinations = [...locations];

      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      }
    });

    it("allows navigating between model query & metadata tabs", () => {
      const destinations = [
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
      ];

      for (const destination of destinations) {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      }
    });
  });

  describe("when editing notebook model", () => {
    const isNewQuestion = false;
    const question = notebookModelQuestion;

    it("allows navigating between model query & metadata tabs", () => {
      const destinations = [modelQueryTabLocation, modelMetadataTabLocation];

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
    const question = nativeModelQuestion;

    it("allows navigating between model query & metadata tabs", () => {
      const destinations = [modelQueryTabLocation, modelMetadataTabLocation];

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
