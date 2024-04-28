import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import {
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import { serializeCardForUrl } from "metabase/lib/card";
import registerVisualizations from "metabase/visualizations/register";

import {
  TEST_COLLECTION,
  TEST_METADATA,
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
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("creating models", () => {
    it("shows custom warning modal when leaving via SPA navigation", async () => {
      const { history } = await setup({
        card: null,
        initialRoute: "/model/new",
      });

      await startNewNotebookModel();

      history.push("/redirect");

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
      setupCardQueryMetadataEndpoint(TEST_NATIVE_CARD);

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

      history.push("/redirect");

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

        history.push("/redirect");

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

        history.push("/redirect");

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

        history.push("/redirect");

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
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

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

        history.push("/redirect");

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

        history.push("/redirect");

        expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
      });

      it("does not show custom warning modal when leaving unedited metadata via SPA navigation", async () => {
        const { history } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        history.push("/redirect");

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
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        /**
         * When initialRoute is `/model/${TEST_MODEL_CARD.id}/metadata`,
         * the QueryBuilder gets incompletely intialized.
         * This seems to affect only tests.
         */
        await userEvent.click(screen.getByText("Metadata"));

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

        history.push("/redirect");

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

      await userEvent.click(screen.getByLabelText("notebook icon"));

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

      history.push("/redirect");

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

      history.push("/redirect");

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
      fetchMock.post("path:/api/card", TEST_NATIVE_CARD);
      fetchMock.get("path:/api/table/card__1/query_metadata", TEST_METADATA);

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
          within(saveQuestionModal).getByLabelText(/Which collection/),
        ).toHaveTextContent(TEST_COLLECTION.name);
      });
      await userEvent.click(within(saveQuestionModal).getByText("Save"));

      await waitFor(() => {
        expect(saveQuestionModal).not.toBeInTheDocument();
      });

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();

      history.push("/redirect");

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

      history.push("/redirect");

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

      history.push("/redirect");

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

      history.push("/redirect");

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

      history.push("/redirect");

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

      history.push("/redirect");

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

      history.push("/redirect");

      expect(screen.getByTestId("leave-confirmation")).toBeInTheDocument();
    });

    it("does not show custom warning modal when leaving visualization-edited question via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}`,
      });

      await triggerVisualizationQueryChange();
      await waitForSaveToBeEnabled();

      history.push("/redirect");

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });

    it("does not show custom warning modal leaving with no changes via SPA navigation", async () => {
      const { history } = await setup({
        card: TEST_STRUCTURED_CARD,
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
      });

      history.push("/redirect");

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

      await userEvent.click(screen.getByLabelText("notebook icon"));

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
        initialRoute: `/question/${TEST_STRUCTURED_CARD.id}/notebook`,
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

      history.push("/redirect");

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

      history.push("/redirect");

      expect(
        screen.queryByTestId("leave-confirmation"),
      ).not.toBeInTheDocument();
    });
  });
});
