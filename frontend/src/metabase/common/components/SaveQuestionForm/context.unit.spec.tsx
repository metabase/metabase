import * as formik from "formik";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  defaultAuditInfo,
  setupAuditInfoEndpoint,
  setupCollectionByIdEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { render, renderWithProviders, screen, waitFor } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockRecentCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  FormValuesPatcher,
  SaveQuestionProvider,
  useSaveQuestionContext,
} from "./context";

const TestComponent = () => {
  const { values, saveToDashboard } = useSaveQuestionContext();
  return (
    <div>
      {values.collection_id && (
        <div data-testid="collectionId">{values.collection_id}</div>
      )}
      {values.dashboard_id && (
        <div data-testid="dashboardId">{values.dashboard_id}</div>
      )}
      {saveToDashboard && (
        <div data-testid="saveToDashboard">{saveToDashboard}</div>
      )}
    </div>
  );
};

interface setupProps {
  question?: Question;
  originalQuestion?: Question | null;
}

const setup = ({
  question = new Question(
    createMockCard({
      collection_id: undefined,
      collection: undefined,
      dashboard_id: undefined,
    }),
  ),
  originalQuestion = null,
}: setupProps = {}) => {
  const onCreate = jest.fn();
  const onSave = jest.fn();

  setupAuditInfoEndpoint();

  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      audit_app: true,
    }),
  });

  setupEnterpriseOnlyPlugin("audit_app");
  setupEnterpriseOnlyPlugin("collections");

  renderWithProviders(
    <SaveQuestionProvider
      question={question}
      originalQuestion={originalQuestion}
      onCreate={onCreate}
      onSave={onSave}
    >
      <TestComponent />
    </SaveQuestionProvider>,
    {
      storeInitialState: createMockState({
        currentUser: createMockUser({
          personal_collection_id: 1337,
        }),
        settings,
      }),
    },
  );
};

describe("SaveQuestionContext", () => {
  describe("Computing suggested save locations", () => {
    describe("New Question", () => {
      it("should suggest a dashboard if one has been recently selected", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "dashboard", id: 10 })],
          ["selections"],
        );

        setup();

        expect(await screen.findByTestId("dashboardId")).toHaveTextContent(
          "10",
        );
      });

      it("should suggest a collection if one has been recently selected", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "collection", id: 10 })],
          ["selections"],
        );

        setup();

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            "10",
          ),
        );
        expect(screen.queryByTestId("dashboardId")).not.toBeInTheDocument();
      });

      it("should suggest a default collection id if there are no valid recently selected items", async () => {
        setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

        setup();

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            "1337", // Users personal collection id
          ),
        );
        expect(screen.queryByTestId("dashboardId")).not.toBeInTheDocument();
      });

      it("should require saving to a specific dashboard if the question has a dashboard id already", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "dashboard", id: 10 })],
          ["selections"],
        );

        setup({
          question: new Question({
            ...createMockCard({
              collection_id: 11,
              collection: createMockCollection({ id: 11 }),
              dashboard_id: 20,
            }),
            creationType: "custom_question",
          }),
        });

        expect(screen.getByTestId("saveToDashboard")).toBeInTheDocument();
        expect(screen.getByTestId("saveToDashboard")).toHaveTextContent("20");
      });
    });

    describe("Updating an existing question", () => {
      it("should suggest the existing questions dashboard over a recently selected dashboard", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "dashboard", id: 10 })],
          ["selections"],
        );

        setup({
          question: new Question(
            createMockCard({
              collection_id: 11,
              collection: createMockCollection({ id: 11 }),
              dashboard_id: 20,
            }),
          ),
        });

        expect(await screen.findByTestId("dashboardId")).toHaveTextContent(
          "20",
        );
      });

      it("should suggest the existing questions collection over a recently selected collection", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "collection", id: 10 })],
          ["selections"],
        );

        setup({
          question: new Question(
            createMockCard({
              collection_id: 20,
              collection: createMockCollection({ id: 20 }),
              dashboard_id: undefined,
            }),
          ),
        });

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            "20",
          ),
        );
        expect(screen.queryByTestId("dashboardId")).not.toBeInTheDocument();
      });

      it("should not suggest a dashboard if we are working with a model", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "dashboard", id: 10 })],
          ["selections"],
        );

        setup({
          question: new Question(
            createMockCard({
              collection_id: 11,
              collection: createMockCollection({ id: 11 }),
              type: "model",
            }),
          ),
        });

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            "11",
          ),
        );

        expect(screen.queryByTestId("dashboardId")).not.toBeInTheDocument();
      });

      it("should suggest the custom reports collection when the original question is in the IA folder", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "collection", id: 10 })],
          ["selections"],
        );

        const IACollection = createMockCollection({
          id: 20,
          type: "instance-analytics",
          can_write: false,
        });

        setupCollectionByIdEndpoint({
          collections: [
            IACollection,
            createMockCollection({
              id: defaultAuditInfo.custom_reports,
              name: "custom reports",
              can_write: true,
            }),
          ],
        });

        setup({
          question: new Question(
            createMockCard({
              collection_id: 20,
              collection: IACollection,
              dashboard_id: undefined,
            }),
          ),
          originalQuestion: new Question(
            createMockCard({
              collection_id: 20,
              collection: IACollection,
              dashboard_id: undefined,
              can_write: false,
            }),
          ),
        });

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            defaultAuditInfo.custom_reports.toString(),
          ),
        );
      });

      it("should not require saving to a specific dashboard if saving a new version of an existing question", async () => {
        const collection = createMockCollection({ id: 11 });
        setupCollectionByIdEndpoint({ collections: [collection] });
        setupRecentViewsAndSelectionsEndpoints([], ["selections"]);

        const originalQuestion = new Question(
          createMockCard({ collection, collection_id: 11, dashboard_id: 20 }),
        );
        setup({
          originalQuestion,
          question: originalQuestion.clone(),
        });

        expect(screen.queryByTestId("saveToDashboard")).not.toBeInTheDocument();
      });
    });

    describe("Updating an existing question that is read only", () => {
      const getProps = (opts?: Partial<Card>) => {
        const card = {
          collection_id: 11,
          collection: createMockCollection({ id: 11 }),
          ...opts,
        };

        const question = new Question(createMockCard(card));
        const originalQuestion = new Question(
          createMockCard({ ...card, can_write: false }),
        );

        return { question, originalQuestion };
      };

      beforeEach(() => {
        setupCollectionByIdEndpoint({
          collections: [createMockCollection({ id: 11 })],
        });
      });

      it("should suggest a recently selected dashboard over the existing questions dashboard", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "dashboard", id: 10 })],
          ["selections"],
        );

        setup({ ...getProps({ dashboard_id: 20 }) });

        expect(await screen.findByTestId("dashboardId")).toHaveTextContent(
          "10",
        );
      });

      it("should suggest a recently selected collection over the existing questions collection", async () => {
        setupRecentViewsAndSelectionsEndpoints(
          [createMockRecentCollectionItem({ model: "collection", id: 10 })],
          ["selections"],
        );

        setup({ ...getProps() });

        await waitFor(async () =>
          expect(await screen.findByTestId("collectionId")).toHaveTextContent(
            "10",
          ),
        );
        expect(screen.queryByTestId("dashboardId")).not.toBeInTheDocument();
      });
    });
  });
});

describe("FormValuesPatcher", () => {
  const setValuesSpy = jest.fn();
  const setup = (initialValue: unknown) => {
    jest.spyOn(formik, "useFormikContext").mockReturnValue({
      values: initialValue,
      setValues: setValuesSpy,
    } as unknown as formik.FormikContextType<unknown>);
  };

  beforeEach(() => {
    setValuesSpy.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should patch untouched fields when nextValues change", () => {
    setup({ name: "initial", count: 1 });

    const { rerender } = render(
      <FormValuesPatcher nextValues={{ name: "initial", count: 1 }}>
        <div />
      </FormValuesPatcher>,
    );

    rerender(
      <FormValuesPatcher nextValues={{ name: "updated", count: 99 }}>
        <div />
      </FormValuesPatcher>,
    );

    expect(setValuesSpy).toHaveBeenCalledWith({ name: "updated", count: 99 });
  });

  it("should preserve user-modified fields when nextValues change", () => {
    setup({ name: "user typed", count: 1 });

    const { rerender } = render(
      <FormValuesPatcher nextValues={{ name: "initial", count: 1 }}>
        <div />
      </FormValuesPatcher>,
    );

    rerender(
      <FormValuesPatcher nextValues={{ name: "updated", count: 99 }}>
        <div />
      </FormValuesPatcher>,
    );

    expect(setValuesSpy).toHaveBeenCalledWith({
      name: "user typed",
      count: 99,
    });
  });

  it("should not patch anything when nextValues remain unchanged", () => {
    setup({ name: "initial", count: 1 });

    const { rerender } = render(
      <FormValuesPatcher nextValues={{ name: "initial", count: 1 }}>
        <div />
      </FormValuesPatcher>,
    );

    rerender(
      <FormValuesPatcher nextValues={{ name: "initial", count: 1 }}>
        <div />
      </FormValuesPatcher>,
    );

    expect(setValuesSpy).not.toHaveBeenCalled();
  });
});
