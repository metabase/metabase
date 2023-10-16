import { createMockLocation } from "__support__/location";
import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { checkNotNull } from "metabase/core/utils/types";
import { serializeCardForUrl } from "metabase/lib/card";
import type Question from "metabase-lib/Question";

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

type UrlType = "id" | "slug";

const getModelLocations = (model: Question) => [
  getModelQueryTabLocation(model, "id"),
  getModelQueryTabLocation(model, "slug"),
  getModelMetadataTabLocation(model, "id"),
  getModelMetadataTabLocation(model, "slug"),
];

const getModelQueryTabLocation = (model: Question, urlType: UrlType) => {
  const slug = urlType === "slug" ? model.slug() : model.id();
  const pathname = `/model/${slug}/query`;
  return createMockLocation({ pathname });
};

const getModelMetadataTabLocation = (model: Question, urlType: UrlType) => {
  const slug = urlType === "slug" ? model.slug() : model.id();
  const pathname = `/model/${slug}/metadata`;
  return createMockLocation({ pathname });
};

const getNotebookQuestionLocations = (question: Question) => [
  ...getQuestionLocations(question),
  getNotebookQuestionLocation(question, "slug"),
  getNotebookQuestionLocation(question, "id"),
];

const getQuestionLocations = (question: Question) => [
  getQuestionLocation(question, "slug"),
  getQuestionLocation(question, "id"),
];

const getQuestionLocation = (question: Question, urlType: UrlType) => {
  const slug = urlType === "slug" ? question.slug() : question.id();
  const pathname = `/question/${slug}`;
  return createMockLocation({ pathname });
};

const getNotebookQuestionLocation = (question: Question, urlType: UrlType) => {
  const slug = urlType === "slug" ? question.slug() : question.id();
  const pathname = `/question/${slug}/notebook`;
  return createMockLocation({ pathname });
};

const runQuestionLocation = createMockLocation({
  pathname: "/question",
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
      ...getModelLocations(notebookModelQuestion),
      ...getModelLocations(nativeModelQuestion),
      ...getNotebookQuestionLocations(notebookQuestion),
      newModelQueryTabLocation,
      newModelMetadataTabLocation,
      runQuestionLocation,
    ])("allows navigating away to `$pathname`", destination => {
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: true }),
      ).toBe(true);
      expect(
        isNavigationAllowed({ destination, question, isNewQuestion: false }),
      ).toBe(true);
    });
  });

  describe("when creating new notebook question", () => {
    const isNewQuestion = true;
    const question = notebookQuestion;

    describe("allows navigating away", () => {
      it.each([
        anyLocation,
        ...getModelLocations(notebookModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
        runQuestionLocation,
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
        ...getModelLocations(notebookModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when editing notebook question", () => {
    const isNewQuestion = false;
    const question = notebookQuestion;

    it("allows to run the question", () => {
      const destination = runQuestionLocation;

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    it("allows to open notebook editor", () => {
      const destination = getNotebookQuestionLocation(question, "slug");

      expect(
        isNavigationAllowed({ destination, question, isNewQuestion }),
      ).toBe(true);
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(notebookModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(nativeQuestion),
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
        ...getModelLocations(notebookModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        newModelQueryTabLocation,
        newModelMetadataTabLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when creating new model", () => {
    const isNewQuestion = true;
    const question = notebookModelQuestion;

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

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(notebookModelQuestion),
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        runQuestionLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });

  describe("when editing notebook model", () => {
    const isNewQuestion = false;
    const question = notebookModelQuestion;

    describe("allows navigating between model query & metadata tabs", () => {
      it.each(getModelLocations(question))("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(true);
      });
    });

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(nativeModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        newModelMetadataTabLocation,
        newModelQueryTabLocation,
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

    describe("disallows all other navigation", () => {
      it.each([
        anyLocation,
        ...getModelLocations(notebookModelQuestion),
        ...getNotebookQuestionLocations(notebookQuestion),
        newModelMetadataTabLocation,
        newModelQueryTabLocation,
      ])("to `$pathname`", destination => {
        expect(
          isNavigationAllowed({ destination, question, isNewQuestion }),
        ).toBe(false);
      });
    });
  });
});
