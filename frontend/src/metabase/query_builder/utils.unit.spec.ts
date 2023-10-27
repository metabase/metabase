import { createMockLocation } from "__support__/location";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/lib/types";
import { serializeCardForUrl } from "metabase/lib/card";
import type Question from "metabase-lib/Question";

import { isNavigationAllowed } from "./utils";

const structuredCard = createMockCard({
  id: getNextId(),
  name: "structured question",
});

const nativeCard = createMockCard({
  id: getNextId(),
  name: "native question",
  dataset_query: createMockNativeDatasetQuery(),
});

const structuredModelCard = createMockCard({
  id: getNextId(),
  name: "structured model",
  dataset: true,
});

const nativeModelCard = createMockCard({
  id: getNextId(),
  name: "native model",
  dataset: true,
  dataset_query: createMockNativeDatasetQuery(),
});

const cards = [
  structuredCard,
  nativeCard,
  structuredModelCard,
  nativeModelCard,
];

const metadata = createMockMetadata({ questions: cards });

const structuredQuestion = checkNotNull(metadata.question(structuredCard.id));

const nativeQuestion = checkNotNull(metadata.question(nativeCard.id));

const structuredModelQuestion = checkNotNull(
  metadata.question(structuredModelCard.id),
);

const nativeModelQuestion = checkNotNull(metadata.question(nativeModelCard.id));

const questions = [
  structuredQuestion,
  nativeQuestion,
  structuredModelQuestion,
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

const getModelLocations = (model: Question) => [
  createMockLocation({ pathname: `/model/${model.id()}` }),
  createMockLocation({ pathname: `/model/${model.slug()}` }),
  createMockLocation({ pathname: `/model/${model.id()}/query` }),
  createMockLocation({ pathname: `/model/${model.slug()}/query` }),
  createMockLocation({ pathname: `/model/${model.id()}/metadata` }),
  createMockLocation({ pathname: `/model/${model.slug()}/metadata` }),
];

const getStructuredQuestionLocations = (question: Question) => [
  createMockLocation({ pathname: `/question/${question.id()}` }),
  createMockLocation({ pathname: `/question/${question.slug()}` }),
  createMockLocation({ pathname: `/question/${question.id()}/notebook` }),
  createMockLocation({ pathname: `/question/${question.slug()}/notebook` }),
];

const getNativeQuestionLocations = (question: Question) => [
  createMockLocation({ pathname: `/question/${question.id()}` }),
  createMockLocation({ pathname: `/question/${question.slug()}` }),
];

const runModelLocation = createMockLocation({
  pathname: "/model",
  hash: `#${serializeCardForUrl(nativeModelCard)}`,
});

const runModelEditNotebookLocation = createMockLocation({
  pathname: "/model/notebook",
  hash: `#${serializeCardForUrl(nativeModelCard)}`,
});

const runQuestionLocation = createMockLocation({
  pathname: "/question",
  hash: `#${serializeCardForUrl(nativeCard)}`,
});

const runQuestionEditNotebookLocation = createMockLocation({
  pathname: "/question/notebook",
  hash: `#${serializeCardForUrl(nativeCard)}`,
});

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

    it.each([
      anyLocation,
      ...getModelLocations(structuredModelQuestion),
      ...getModelLocations(nativeModelQuestion),
      ...getStructuredQuestionLocations(structuredQuestion),
      ...getNativeQuestionLocations(nativeQuestion),
      newModelQueryTabLocation,
      newModelMetadataTabLocation,
      runModelLocation,
      runModelEditNotebookLocation,
      runQuestionLocation,
      runQuestionEditNotebookLocation,
    ])("allows navigating away to `$pathname`", destination => {
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: true }),
      ).toBe(true);
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: false }),
      ).toBe(true);
    });
  });

  describe("when creating new structured question", () => {
    const isNewQuestion = true;
    const question = structuredQuestion;

    describe("allows navigating away", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        runModelLocation,
        runModelEditNotebookLocation,
        runQuestionLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });
  });

  describe("when creating new native question", () => {
    const isNewQuestion = true;
    const question = nativeQuestion;

    it("allows to run the question", () => {
      const destination = runQuestionLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        runModelLocation,
        runModelEditNotebookLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when editing structured question", () => {
    const isNewQuestion = false;
    const question = structuredQuestion;

    it("allows to run the question", () => {
      const destination = runQuestionLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to run the question and then edit it again", () => {
      const destination = runQuestionEditNotebookLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to run a model", () => {
      const destination = runModelLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("allows to open the question and the notebook editor", () => {
      it.each(getStructuredQuestionLocations(question))(
        "to `$pathname`",
        destination => {
          expect(
            isNavigationAllowed({ destination, question, isNewQuestion }),
          ).toBe(true);
        },
      );
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
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
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        runModelLocation,
        runModelEditNotebookLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when creating new model", () => {
    const isNewQuestion = true;
    const question = structuredModelQuestion;

    describe("allows navigating between model query & metadata tabs", () => {
      it.each([newModelQueryTabLocation, newModelMetadataTabLocation])(
        "to `$pathname`",
        destination => {
          expect(
            isNavigationAllowed({ destination, question, isNewQuestion }),
          ).toBe(true);
        },
      );
    });

    it("allows to run the model", () => {
      const destination = runModelLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to run the model and then edit it again", () => {
      const destination = runModelEditNotebookLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        runQuestionLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when editing structured model", () => {
    const isNewQuestion = false;
    const question = structuredModelQuestion;

    describe("allows navigating between model query & metadata tabs", () => {
      it.each(getModelLocations(question))("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    it("allows to run the model", () => {
      const destination = runModelLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to run the model and then edit it again", () => {
      const destination = runModelEditNotebookLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(nativeModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelMetadataTabLocation,
        newModelQueryTabLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when editing native-query model", () => {
    const isNewQuestion = false;
    const question = nativeModelQuestion;

    describe("allows navigating between model query & metadata tabs", () => {
      it.each(getModelLocations(question))("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    it("allows to run the model", () => {
      const destination = runModelLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelMetadataTabLocation,
        newModelQueryTabLocation,
        runModelEditNotebookLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });
});
