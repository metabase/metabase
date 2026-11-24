import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { createMockMetadata } from "__support__/metadata";
import {
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
  setupFieldValuesEndpoint,
} from "__support__/server-mocks";
import {
  act,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { getStructuredQuestionUrlWithParameters } from "metabase/dashboard/click-behavior/question-url";
import { setPendingMetabotCard } from "metabase/redux/query-builder";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
  createProductsCategoryDatasetColumn,
  createProductsIdDatasetColumn,
  createProductsTitleDatasetColumn,
  createProductsVendorDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  TEST_DB,
  TEST_MODEL_CARD,
  TEST_MODEL_CARD_SLUG,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_STRUCTURED_CARD,
  TEST_UNSAVED_NATIVE_CARD,
  revertNotebookQueryChange,
  setup,
  triggerMetadataChange,
  triggerNativeQueryChange,
  triggerNotebookQueryChange,
  triggerVisualizationQueryChange,
  waitForNativeQueryEditorReady,
  waitForSaveChangesToBeDisabled,
  waitForSaveChangesToBeEnabled,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

describe("QueryBuilder - unsaved changes warning", () => {
  const scrollBy = HTMLElement.prototype.scrollBy;

  mockGetBoundingClientRect();

  beforeEach(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = scrollBy;

    jest.resetAllMocks();
    setupJestCanvasMock();
  });

  describe("editing models", () => {
    describe("editing as notebook question", () => {
      it("does not show custom warning modal after editing model-based question via notebook editor and saving it", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/notebook`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveToBeEnabled();

        await userEvent.click(screen.getByText("Save"));
        await userEvent.click(
          within(screen.getByTestId("save-question-modal")).getByText("Save"),
        );

        await waitFor(() => {
          expect(
            screen.queryByTestId("save-question-modal"),
          ).not.toBeInTheDocument();
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        act(() => {
          router.navigate("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing queries", () => {
      it("shows custom warning modal when leaving edited query via SPA navigation", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        act(() => {
          router.navigate("/redirect");
        });

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited query via SPA navigation", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await revertNotebookQueryChange();
        await waitForSaveChangesToBeDisabled();

        act(() => {
          router.navigate("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("shows custom warning modal when leaving edited query via Cancel button", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited query via Cancel button", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await revertNotebookQueryChange();
        await waitForSaveChangesToBeDisabled();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited query", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: "/",
        });

        act(() => {
          router.navigate(`/model/${TEST_MODEL_CARD.id}/query`);
        });
        await waitForLoaderToBeRemoved();

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(
          screen.getByRole("button", { name: "Save changes" }),
        );

        await waitFor(() => {
          expect(router.location.pathname).toEqual(
            `/model/${TEST_MODEL_CARD_SLUG}`,
          );
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        act(() => {
          router.navigate("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing metadata", () => {
      it("shows custom warning modal when leaving edited metadata via SPA navigation", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/columns`,
        });

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        act(() => {
          router.navigate("/redirect");
        });

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited metadata via SPA navigation", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/columns`,
        });

        act(() => {
          router.navigate("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving with no changes via Cancel button", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/columns`,
        });

        await waitForLoaderToBeRemoved();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("shows custom warning modal when leaving with unsaved changes via Cancel button", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/columns`,
        });

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited metadata", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: "/",
        });

        act(() => {
          router.navigate(`/model/${TEST_MODEL_CARD.id}/query`);
        });
        await waitForLoaderToBeRemoved();

        /**
         * When initialRoute is `/model/${TEST_MODEL_CARD.id}/columns`,
         * the QueryBuilder gets incompletely initialized.
         * This seems to affect only tests.
         */
        await userEvent.click(await screen.findByText("Columns"));

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(
          screen.getByRole("button", { name: "Save changes" }),
        );

        await waitFor(() => {
          expect(router.location.pathname).toEqual(
            `/model/${TEST_MODEL_CARD_SLUG}`,
          );
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        act(() => {
          router.navigate("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    it("does not show custom warning modal when navigating between tabs with unsaved changes", async () => {
      await setup({
        card: TEST_MODEL_CARD,
        dataset: TEST_MODEL_DATASET,
        initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveChangesToBeEnabled();

      await userEvent.click(screen.getByTestId("editor-tabs-columns-name"));

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      await triggerMetadataChange();
      await waitForSaveChangesToBeEnabled();

      await userEvent.click(screen.getByTestId("editor-tabs-query-name"));

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    describe("leaving via the browser back button (metabase#32037)", () => {
      // A 1x1 result would switch the model to a scalar and make it dirty
      afterEach(() => {
        window.history.replaceState(null, "", "/");
      });

      const MODEL_DATASET = createMockDataset({
        ...TEST_MODEL_DATASET,
        data: { ...TEST_MODEL_DATASET.data, rows: [["1"], ["2"]] },
        row_count: 2,
      });

      it("discards unsaved query changes and returns to the model", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          dataset: MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}`,
          syncWindowLocation: true,
        });
        const modelPathname = router.location.pathname;

        await openQuestionActionsItem("Edit query definition");
        await waitForSaveChangesToBeDisabled();

        await userEvent.click(
          within(await screen.findByTestId("action-buttons")).getByLabelText(
            "filter icon",
          ),
        );
        const popover = await screen.findByRole("dialog");
        await userEvent.click(within(popover).getByText("ID"));
        await userEvent.type(
          within(popover).getByPlaceholderText("Enter an ID"),
          "1",
        );
        await userEvent.click(
          within(popover).getByRole("button", { name: "Add filter" }),
        );
        await waitForSaveChangesToBeEnabled();

        act(() => router.back());

        await assertDiscardingChanges(router, modelPathname);
      });

      it("discards unsaved metadata changes and returns to the model", async () => {
        const { router } = await setup({
          card: TEST_MODEL_CARD,
          dataset: MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}`,
          syncWindowLocation: true,
        });
        const modelPathname = router.location.pathname;

        await openQuestionActionsItem("Edit metadata");
        await waitForSaveChangesToBeDisabled();

        const description = await screen.findByLabelText("Description");
        await userEvent.type(description, "123");
        await userEvent.tab();
        await waitForSaveChangesToBeEnabled();

        act(() => router.back());

        await assertDiscardingChanges(router, modelPathname);
      });
    });

    it("does not show custom warning modal when editing & visualizing the model back and forth (metabase#35000)", async () => {
      await setup({
        card: TEST_MODEL_CARD,
        initialRoute: `/model/${TEST_MODEL_CARD.id}/notebook`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Visualize"));
      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByTestId("notebook-button"));

      await waitFor(() => {
        expect(screen.getByText("Visualize")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("creating native questions", () => {
    it("shows custom warning modal when leaving creating non-empty question via SPA navigation", async () => {
      const { router } = await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("menu")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        router.navigate("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving creating empty question via SPA navigation", async () => {
      const { router } = await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("menu")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when running new question", async () => {
      await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("menu")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        within(screen.getByTestId("query-builder-main")).getByTestId(
          "run-button",
        ),
      );

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving new question", async () => {
      const { router } = await setup({
        card: null,
        initialRoute: "/",
      });
      setupCardsEndpoints([TEST_NATIVE_CARD]);
      setupCardQueryMetadataEndpoint(
        TEST_NATIVE_CARD,
        createMockCardQueryMetadata({
          databases: [TEST_DB],
        }),
      );

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("menu")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Save"));

      const saveQuestionModal = screen.getByTestId("save-question-modal");
      await userEvent.type(
        within(saveQuestionModal).getByLabelText("Name"),
        TEST_NATIVE_CARD.name,
      );
      await waitFor(() => {
        expect(
          within(saveQuestionModal).getByLabelText(
            /Where do you want to save this/,
          ),
        ).toHaveTextContent("Our analytics");
      });
      await userEvent.click(within(saveQuestionModal).getByText("Save"));

      await waitFor(() => {
        expect(saveQuestionModal).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("native questions Metabot opened", () => {
    const openMetabotCard = async () => {
      const { router, store } = await setup({ card: null, initialRoute: "/" });
      const url = Urls.generatedEntity({
        type: "card",
        query: { query: TEST_UNSAVED_NATIVE_CARD.dataset_query },
      });

      act(() => {
        store.dispatch(setPendingMetabotCard({ url }));
        router.navigate(url);
      });
      await waitForLoaderToBeRemoved();
      await waitForNativeQueryEditorReady();

      return { router };
    };

    it("does not show custom warning modal when leaving Metabot's query via SPA navigation", async () => {
      const { router } = await openMetabotCard();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("shows custom warning modal when leaving Metabot's query after editing it", async () => {
      const { router } = await openMetabotCard();

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();
      act(() => {
        router.navigate("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });
  });

  describe("editing native questions", () => {
    it("shows custom warning modal when leaving edited question via SPA navigation", async () => {
      const { router } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        router.navigate("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving edited question via SPA navigation without changing the query", async () => {
      const { router } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Visualization" }),
      );
      await userEvent.click(screen.getByTestId("more-charts-toggle"));
      await userEvent.click(screen.getByTestId("Detail-button"));
      await waitForSaveToBeEnabled();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
      const { router } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await waitForNativeQueryEditorReady();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when running edited question", async () => {
      await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(
        within(screen.getByTestId("query-builder-main")).getByRole("button", {
          name: "Get Answer",
        }),
      );

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question", async () => {
      const { router } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Save"));

      await userEvent.click(
        within(screen.getByTestId("save-question-modal")).getByText("Save"),
      );

      await waitFor(() => {
        expect(
          screen.queryByTestId("save-question-modal"),
        ).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question as a new one", async () => {
      const { router } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Save"));

      const saveQuestionModal = screen.getByTestId("save-question-modal");
      await userEvent.click(
        within(saveQuestionModal).getByText("Save as new question"),
      );
      await userEvent.type(
        within(saveQuestionModal).getByPlaceholderText(
          "What is the name of your question?",
        ),
        "New question",
      );
      expect(screen.getByTestId("save-question-modal")).toBeInTheDocument();
      await userEvent.click(within(saveQuestionModal).getByText("Save"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("save-question-modal"),
        ).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing notebook questions", () => {
    it("shows custom warning modal when leaving notebook-edited question via SPA navigation", async () => {
      const { router } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();
      act(() => {
        router.navigate("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving visualization-edited question via SPA navigation", async () => {
      const { router } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}`,
      });

      await triggerVisualizationQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
      const { router } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when editing & visualizing the question back and forth (metabase#35000)", async () => {
      await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Visualize"));
      await waitForLoaderToBeRemoved();

      await userEvent.click(screen.getByTestId("notebook-button"));

      await waitFor(() => {
        expect(screen.getByText("Visualize")).toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question", async () => {
      const { router } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: "/",
      });

      act(() => {
        router.navigate(`/question/${TEST_STRUCTURED_CARD.id}/notebook`);
      });
      await waitForLoaderToBeRemoved();

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Save"));

      await userEvent.click(
        within(screen.getByTestId("save-question-modal")).getByText("Save"),
      );

      await waitFor(() => {
        expect(
          screen.queryByTestId("save-question-modal"),
        ).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question as a new one", async () => {
      const { router } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByText("Save"));

      const saveQuestionModal = screen.getByTestId("save-question-modal");
      await userEvent.click(
        within(saveQuestionModal).getByText("Save as new question"),
      );
      await userEvent.type(
        within(saveQuestionModal).getByPlaceholderText(
          "What is the name of your question?",
        ),
        "New question",
      );
      expect(screen.getByTestId("save-question-modal")).toBeInTheDocument();
      await userEvent.click(within(saveQuestionModal).getByText("Save"));

      await waitFor(() => {
        expect(
          screen.queryByTestId("save-question-modal"),
        ).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        router.navigate("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("removing a filter in the notebook of a filtered saved question (metabase#48829)", () => {
    const PRODUCTS_CARD = createMockCard({
      id: 48829,
      name: "Issue 48829",
      dataset_query: Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: PRODUCTS_ID } }],
        }),
      ),
    });

    const PRODUCTS_DATASET = createMockDataset({
      data: createMockDatasetData({
        cols: [
          createProductsIdDatasetColumn(),
          createProductsTitleDatasetColumn(),
          createProductsCategoryDatasetColumn(),
          createProductsVendorDatasetColumn(),
        ],
        rows: [
          [1, "Rustic Paper Wallet", "Gizmo", "Swaniawski, Casper and Hilll"],
          [2, "Small Marble Shoes", "Doohickey", "Balistreri-Ankunding"],
          [
            3,
            "Synergistic Granite Chair",
            "Gadget",
            "Murray, Watsica and Wunsch",
          ],
        ],
      }),
      row_count: 3,
    });

    const setupProductsQuestion = (
      opts: Partial<Parameters<typeof setup>[0]> = {},
    ) => {
      setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);
      return setup({
        card: PRODUCTS_CARD,
        dataset: PRODUCTS_DATASET,
        database: createSampleDatabase({ auto_run_queries: true }),
        syncWindowLocation: true,
        ...opts,
      });
    };

    const getDatasetRunCount = () =>
      fetchMock.callHistory.calls("path:/api/dataset", { method: "POST" })
        .length;

    const removeFilterInNotebookAndVisualize = async (
      router: { location: { pathname: string } },
      filterName: string,
    ) => {
      await userEvent.click(screen.getByTestId("notebook-button"));
      const filterStep = await screen.findByTestId("step-filter-0-0");
      const filterItem = within(filterStep).getByText(filterName);
      await userEvent.click(
        within(
          checkNotNull(filterItem.closest("[data-testid=notebook-cell-item]")),
        ).getByLabelText("close icon"),
      );
      await waitFor(() =>
        expect(
          within(filterStep).queryByText(filterName),
        ).not.toBeInTheDocument(),
      );

      const runCount = getDatasetRunCount();
      await userEvent.click(screen.getByRole("button", { name: "Visualize" }));
      await waitFor(() =>
        expect(getDatasetRunCount()).toBeGreaterThan(runCount),
      );
      await act(() => fetchMock.callHistory.flush(true));

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
      expect(router.location.pathname).toBe("/question");
      expect(screen.queryByTestId("qb-filters-panel")).not.toBeInTheDocument();
      expect(screen.getByText("Showing 3 rows")).toBeInTheDocument();
    };

    it("does not show the warning after adding a filter from a column header", async () => {
      const { router } = await setupProductsQuestion();

      await userEvent.click(
        within(
          await screen.findByRole("columnheader", { name: "Category" }),
        ).getByText("Category"),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: /Filter by this column/ }),
      );
      const popover = await screen.findByRole("dialog");
      await userEvent.click(await within(popover).findByText("Gadget"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );
      expect(
        await within(await screen.findByTestId("qb-filters-panel")).findByText(
          "Category is Gadget",
        ),
      ).toBeInTheDocument();

      await removeFilterInNotebookAndVisualize(router, "Category is Gadget");
    });

    it("does not show the warning after adding a filter with the filter picker", async () => {
      const { router } = await setupProductsQuestion();

      await userEvent.click(
        within(screen.getByTestId("qb-header")).getByRole("button", {
          name: /Filter/,
        }),
      );
      const popover = await screen.findByRole("dialog");
      await userEvent.click(await within(popover).findByText("Category"));
      await userEvent.click(await within(popover).findByText("Gadget"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Apply filter" }),
      );
      expect(
        await within(await screen.findByTestId("qb-filters-panel")).findByText(
          "Category is Gadget",
        ),
      ).toBeInTheDocument();

      await removeFilterInNotebookAndVisualize(router, "Category is Gadget");
    });

    it("does not show the warning after opening the question filtered by a dashboard click", async () => {
      // The URL a dashboard click behavior opens: the saved question with
      // the clicked value as a filter, built by the click behavior code.
      const metadata = createMockMetadata({
        databases: [createSampleDatabase()],
      });
      const question = new Question(PRODUCTS_CARD, metadata);
      const url = getStructuredQuestionUrlWithParameters(
        question.setQuery(Lib.ensureFilterStage(question.query())),
        question,
        [
          {
            id: "title",
            slug: "title",
            name: "Title",
            type: "string/=",
            target: ["dimension", ["field", PRODUCTS.TITLE, null]],
          },
        ],
        { title: "Rustic Paper Wallet" },
      );
      const { router } = await setupProductsQuestion({ initialRoute: url });

      expect(
        await within(await screen.findByTestId("qb-filters-panel")).findByText(
          "Title is Rustic Paper Wallet",
        ),
      ).toBeInTheDocument();

      await removeFilterInNotebookAndVisualize(
        router,
        "Title is Rustic Paper Wallet",
      );
    });
  });
});

async function openQuestionActionsItem(itemName: string) {
  await userEvent.click(screen.getByLabelText("Move, trash, and more…"));
  await userEvent.click(await screen.findByText(itemName));
}

async function assertDiscardingChanges(
  router: { location: { pathname: string } },
  modelPathname: string,
) {
  const modal = await screen.findByTestId("leave-confirmation");
  expect(within(modal).getByText("Discard your changes?")).toBeInTheDocument();
  await userEvent.click(
    within(modal).getByRole("button", { name: "Discard changes" }),
  );

  await waitFor(() => {
    expect(router.location.pathname).toBe(modelPathname);
  });
  expect(
    screen.queryByRole("button", { name: "Save changes" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByTestId("table-root")).toBeInTheDocument();
}
