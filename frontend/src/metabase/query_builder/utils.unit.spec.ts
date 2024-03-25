import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import { serializeCardForUrl } from "metabase/lib/card";
import { checkNotNull } from "metabase/lib/types";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createMockLocation } from "metabase-types/store/mocks";

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
  type: "model",
});

const nativeModelCard = createMockCard({
  id: getNextId(),
  name: "native model",
  type: "model",
  dataset_query: createMockNativeDatasetQuery(),
});

const structuredMetricCard = createMockCard({
  id: getNextId(),
  name: "structured metric",
  type: "metric",
});

const cards: Card[] = [
  structuredCard,
  nativeCard,
  structuredModelCard,
  nativeModelCard,
  structuredMetricCard,
];

const metadata = createMockMetadata({ questions: cards });

const structuredQuestion = checkNotNull(metadata.question(structuredCard.id));

const nativeQuestion = checkNotNull(metadata.question(nativeCard.id));

const structuredModelQuestion = checkNotNull(
  metadata.question(structuredModelCard.id),
);

const nativeModelQuestion = checkNotNull(metadata.question(nativeModelCard.id));

const structuredMetricQuestion = checkNotNull(
  metadata.question(structuredMetricCard.id),
);

const questions: Question[] = [
  structuredQuestion,
  nativeQuestion,
  structuredModelQuestion,
  nativeModelQuestion,
  structuredMetricQuestion,
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

const newMetricQueryTabLocation = createMockLocation({
  pathname: "/metric/query",
});

const newMetricMetadataTabLocation = createMockLocation({
  pathname: "/metric/metadata",
});

const getRunModelLocation = (model: Question) =>
  createMockLocation({
    pathname: `/model/${model.id()}/query`,
    hash: `#${serializeCardForUrl(nativeModelCard)}`,
  });

const getModelLocations = (model: Question) => [
  createMockLocation({ pathname: `/model/${model.id()}` }),
  createMockLocation({ pathname: `/model/${model.slug()}` }),
  createMockLocation({ pathname: `/model/${model.id()}/query` }),
  createMockLocation({ pathname: `/model/${model.slug()}/query` }),
  createMockLocation({ pathname: `/model/${model.id()}/metadata` }),
  createMockLocation({ pathname: `/model/${model.slug()}/metadata` }),
  createMockLocation({ pathname: `/model/${model.id()}/notebook` }),
  createMockLocation({ pathname: `/model/${model.slug()}/notebook` }),
  getRunModelLocation(model),
];

const getRunMetricLocation = (metric: Question) =>
  createMockLocation({
    pathname: `/metric/${metric.id()}/query`,
    hash: `#${serializeCardForUrl(structuredMetricCard)}`,
  });

const getMetricLocations = (metric: Question) => [
  createMockLocation({ pathname: `/metric/${metric.id()}` }),
  createMockLocation({ pathname: `/metric/${metric.slug()}` }),
  createMockLocation({ pathname: `/metric/${metric.id()}/query` }),
  createMockLocation({ pathname: `/metric/${metric.slug()}/query` }),
  createMockLocation({ pathname: `/metric/${metric.id()}/metadata` }),
  createMockLocation({ pathname: `/metric/${metric.slug()}/metadata` }),
  createMockLocation({ pathname: `/metric/${metric.id()}/notebook` }),
  createMockLocation({ pathname: `/metric/${metric.slug()}/notebook` }),
  getRunMetricLocation(metric),
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

const runNewModelLocation = createMockLocation({
  pathname: "/model/query",
  hash: `#${serializeCardForUrl(nativeModelCard)}`,
});

const runMetricLocation = createMockLocation({
  pathname: "/metric",
  hash: `#${serializeCardForUrl(structuredMetricCard)}`,
});

const runNewMetricLocation = createMockLocation({
  pathname: "/metric/query",
  hash: `#${serializeCardForUrl(structuredMetricCard)}`,
});

const runQuestionLocation = createMockLocation({
  pathname: "/question",
  hash: `#${serializeCardForUrl(nativeCard)}`,
});

const getRunQuestionLocations = (question: Question) => [
  createMockLocation({
    pathname: `/question/${question.id()}`,
    hash: `#${serializeCardForUrl(nativeCard)}`,
  }),
  createMockLocation({
    pathname: `/question/${question.slug()}`,
    hash: `#${serializeCardForUrl(nativeCard)}`,
  }),
];

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
      ...getMetricLocations(structuredMetricQuestion),
      ...getStructuredQuestionLocations(structuredQuestion),
      ...getNativeQuestionLocations(nativeQuestion),
      newModelQueryTabLocation,
      newModelMetadataTabLocation,
      newMetricQueryTabLocation,
      newMetricMetadataTabLocation,
      runModelLocation,
      runNewModelLocation,
      runMetricLocation,
      runNewMetricLocation,
      runQuestionLocation,
      ...getRunQuestionLocations(structuredQuestion),
      ...getRunQuestionLocations(nativeQuestion),
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
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runModelLocation,
        runNewModelLocation,
        runMetricLocation,
        runNewMetricLocation,
        runQuestionLocation,
        ...getRunQuestionLocations(structuredQuestion),
        ...getRunQuestionLocations(nativeQuestion),
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

    describe("allows to run the question", () => {
      it.each([
        runQuestionLocation,
        ...getRunQuestionLocations(nativeQuestion),
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        ...getRunQuestionLocations(structuredQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runModelLocation,
        runNewModelLocation,
        runMetricLocation,
        runNewMetricLocation,
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

    describe("allows to run the question", () => {
      it.each([
        runQuestionLocation,
        ...getRunQuestionLocations(structuredQuestion),
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    it("allows to run the question and then edit it again", () => {
      const destination = runQuestionEditNotebookLocation;

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
        ...getMetricLocations(structuredMetricQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        ...getRunQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
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

    describe("allows to run the question", () => {
      it.each([
        runQuestionLocation,
        ...getRunQuestionLocations(nativeQuestion),
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        ...getRunQuestionLocations(structuredQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runModelLocation,
        runNewModelLocation,
        runMetricLocation,
        runNewMetricLocation,
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
      const destination = runNewModelLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        runQuestionLocation,
        ...getRunQuestionLocations(structuredQuestion),
        ...getRunQuestionLocations(nativeQuestion),
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

    it("allows to run edited model", () => {
      const destination = getRunModelLocation(structuredModelQuestion);

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(nativeModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runMetricLocation,
        runNewMetricLocation,
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

    it("allows to run edited model", () => {
      const destination = getRunModelLocation(nativeModelQuestion);

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
        ...getStructuredQuestionLocations(structuredQuestion),
        ...getNativeQuestionLocations(nativeQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runMetricLocation,
        runNewMetricLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when creating new metric", () => {
    const isNewQuestion = true;
    const question = structuredMetricQuestion;

    describe("allows navigating between metric query & metadata tabs", () => {
      it.each([newMetricQueryTabLocation, newMetricMetadataTabLocation])(
        "to `$pathname`",
        destination => {
          expect(
            isNavigationAllowed({ destination, question, isNewQuestion }),
          ).toBe(true);
        },
      );
    });

    it("allows to run the metric", () => {
      const destination = runNewMetricLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(structuredModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getMetricLocations(structuredMetricQuestion),
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

  describe("when editing structured metric", () => {
    const isNewQuestion = false;
    const question = structuredMetricQuestion;

    describe("allows navigating between metric query & metadata tabs", () => {
      it.each(getMetricLocations(question))("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    it("allows to run the metric", () => {
      const destination = runMetricLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to run edited metric", () => {
      const destination = getRunMetricLocation(structuredMetricQuestion);

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
        newMetricQueryTabLocation,
        newMetricMetadataTabLocation,
        runQuestionEditNotebookLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });
});
