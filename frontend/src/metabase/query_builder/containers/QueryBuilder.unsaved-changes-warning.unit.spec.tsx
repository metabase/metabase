import userEvent from "@testing-library/user-event";

import {
  setupCardCreateEndpoint,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCardsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/lib/card";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCardQueryMetadata,
  createMockDataset,
} from "metabase-types/api/mocks";

import {
  TEST_COLLECTION,
  TEST_DB,
  TEST_MODEL_CARD,
  TEST_MODEL_CARD_SLUG,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_STRUCTURED_CARD,
  TEST_UNSAVED_NATIVE_CARD,
  revertNotebookQueryChange,
  setup,
  startNewNotebookModel,
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
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  beforeEach(() => {
    HTMLElement.prototype.scrollBy = jest.fn();
    // needed for @tanstack/react-virtual, see https://github.com/TanStack/virtual/issues/29#issuecomment-657519522
    HTMLElement.prototype.getBoundingClientRect = jest
      .fn()
      .mockReturnValue({ height: 1, width: 1 });
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = scrollBy;
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;

    jest.resetAllMocks();
  });

  describe("creating models", () => {
    it("shows custom warning modal when leaving via SPA navigation", async () => {
      const { history } = await setup({
        card: null,
        initialRoute: "/model/new",
      });

      await startNewNotebookModel();

      act(() => {
        history.push("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("shows custom warning modal when leaving via Cancel button", async () => {
      await setup({
        card: null,
        initialRoute: "/model/new",
      });

      await startNewNotebookModel();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when saving new model", async () => {
      await setup({
        card: null,
        initialRoute: "/model/new",
      });
      setupCardCreateEndpoint();
      setupCardEndpoints(TEST_NATIVE_CARD);
      setupCardQueryEndpoints(TEST_NATIVE_CARD, createMockDataset());
      setupCardQueryMetadataEndpoint(
        TEST_NATIVE_CARD,
        createMockCardQueryMetadata({
          databases: [TEST_DB],
        }),
      );

      await startNewNotebookModel();
      await waitForSaveToBeEnabled();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));
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
    });

    it("shows custom warning modal when user tries to leave an ad-hoc native query", async () => {
      const { history } = await setup({
        card: TEST_UNSAVED_NATIVE_CARD,
        initialRoute: `/question#${serializeCardForUrl(
          TEST_UNSAVED_NATIVE_CARD,
        )}`,
      });

      await triggerNativeQueryChange();

      act(() => {
        history.push("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });
  });

  describe("editing models", () => {
    describe("editing as notebook question", () => {
      it("does not show custom warning modal after editing model-based question via notebook editor and saving it", async () => {
        const { history } = await setup({
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
          history.push("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing queries", () => {
      it("shows custom warning modal when leaving edited query via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        act(() => {
          history.push("/redirect");
        });

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited query via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await revertNotebookQueryChange();
        await waitForSaveChangesToBeDisabled();

        act(() => {
          history.push("/redirect");
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
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: "/",
        });

        history.push(`/model/${TEST_MODEL_CARD.id}/query`);
        await waitForLoaderToBeRemoved();

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(
          screen.getByRole("button", { name: "Save changes" }),
        );

        await waitFor(() => {
          expect(history.getCurrentLocation().pathname).toEqual(
            `/model/${TEST_MODEL_CARD_SLUG}`,
          );
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        act(() => {
          history.push("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });
    });

    describe("editing metadata", () => {
      it("shows custom warning modal when leaving edited metadata via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        act(() => {
          history.push("/redirect");
        });

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited metadata via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        act(() => {
          history.push("/redirect");
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving with no changes via Cancel button", async () => {
        await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
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
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when saving edited metadata", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: "/",
        });

        history.push(`/model/${TEST_MODEL_CARD.id}/query`);
        await waitForLoaderToBeRemoved();

        /**
         * When initialRoute is `/model/${TEST_MODEL_CARD.id}/metadata`,
         * the QueryBuilder gets incompletely intialized.
         * This seems to affect only tests.
         */
        await userEvent.click(await screen.findByText("Metadata"));

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        await userEvent.click(
          screen.getByRole("button", { name: "Save changes" }),
        );

        await waitFor(() => {
          expect(history.getCurrentLocation().pathname).toEqual(
            `/model/${TEST_MODEL_CARD_SLUG}`,
          );
        });

        expect(
          screen.queryByTestId("leave-confirmation"),
        ).not.toBeInTheDocument();

        act(() => {
          history.push("/redirect");
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

      await userEvent.click(screen.getByTestId("editor-tabs-metadata-name"));

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
      const { history } = await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        history.push("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving creating empty question via SPA navigation", async () => {
      const { history } = await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      act(() => {
        history.push("/redirect");
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
        within(await screen.findByRole("dialog")).getByText("SQL query"),
      );
      await waitForLoaderToBeRemoved();

      await userEvent.click(
        within(screen.getByTestId("query-builder-main")).getByRole("button", {
          name: "Get Answer",
        }),
      );

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving new question", async () => {
      const { history } = await setup({
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
        within(await screen.findByRole("dialog")).getByText("SQL query"),
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
        ).toHaveTextContent(TEST_COLLECTION.name);
      });
      await userEvent.click(within(saveQuestionModal).getByText("Save"));

      await waitFor(() => {
        expect(saveQuestionModal).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      act(() => {
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing native questions", () => {
    it("shows custom warning modal when leaving edited question via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await triggerNativeQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        history.push("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving edited question via SPA navigation without changing the query", async () => {
      const { history } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Visualization" }),
      );
      await userEvent.click(screen.getByTestId("Detail-button"));
      await waitForSaveToBeEnabled();

      act(() => {
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_NATIVE_CARD,
        initialRoute: `/question/${TEST_NATIVE_CARD.id}`,
      });

      await waitForNativeQueryEditorReady();

      act(() => {
        history.push("/redirect");
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
      const { history } = await setup({
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
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question as a new one", async () => {
      const { history } = await setup({
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
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });

  describe("editing notebook questions", () => {
    it("shows custom warning modal when leaving notebook-edited question via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      await triggerNotebookQueryChange();
      await waitForSaveToBeEnabled();
      act(() => {
        history.push("/redirect");
      });

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving visualization-edited question via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}`,
      });

      await triggerVisualizationQueryChange();
      await waitForSaveToBeEnabled();

      act(() => {
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      act(() => {
        history.push("/redirect");
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
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: "/",
      });

      history.push(`/question/${TEST_STRUCTURED_CARD.id}/notebook`);
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
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal when saving edited question as a new one", async () => {
      const { history } = await setup({
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
        history.push("/redirect");
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
