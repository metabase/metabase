import userEvent from "@testing-library/user-event";

import { callMockEvent } from "__support__/events";
import { screen, waitForLoaderToBeRemoved, within } from "__support__/ui";
import { BEFORE_UNLOAD_UNSAVED_MESSAGE } from "metabase/hooks/use-before-unload";
import registerVisualizations from "metabase/visualizations/register";

import {
  TEST_MODEL_CARD,
  TEST_MODEL_DATASET,
  TEST_NATIVE_CARD,
  TEST_STRUCTURED_CARD,
  TEST_UNSAVED_NATIVE_CARD,
  TEST_UNSAVED_STRUCTURED_CARD,
  setup,
  startNewNotebookModel,
  triggerMetadataChange,
  triggerNativeQueryChange,
  triggerNotebookQueryChange,
  waitForSaveChangesToBeEnabled,
  waitForSaveToBeEnabled,
} from "./test-utils";

registerVisualizations();

describe("QueryBuilder - beforeunload events", () => {
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
      const { mockEventListener } = await setup({
        card: null,
        initialRoute: "/model/new",
      });

      await startNewNotebookModel();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });
  });

  describe("editing models", () => {
    describe("editing queries", () => {
      it("should trigger beforeunload event when leaving edited query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        await triggerNotebookQueryChange();
        await waitForSaveChangesToBeEnabled();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when leaving unedited query", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/query`,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });
    });

    describe("editing metadata", () => {
      it("should trigger beforeunload event when leaving edited metadata", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        await triggerMetadataChange();
        await waitForSaveChangesToBeEnabled();

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
      });

      it("should not trigger beforeunload event when model metadata is unedited", async () => {
        const { mockEventListener } = await setup({
          card: TEST_MODEL_CARD,
          dataset: TEST_MODEL_DATASET,
          initialRoute: `/model/${TEST_MODEL_CARD.id}/metadata`,
        });

        const mockEvent = callMockEvent(mockEventListener, "beforeunload");
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockEvent.returnValue).toBe(undefined);
      });
    });
  });

  describe("creating native questions", () => {
    it("should trigger beforeunload event when leaving new non-empty native question", async () => {
      const { mockEventListener } = await setup({
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

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not trigger beforeunload event when leaving new empty native question", async () => {
      const { mockEventListener } = await setup({
        card: null,
        initialRoute: "/",
      });

      await userEvent.click(screen.getByText("New"));
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByText("SQL query"),
      );

      await waitForLoaderToBeRemoved();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toBe(undefined);
    });
  });

  describe("editing native questions", () => {
    it("should trigger beforeunload event when leaving edited question", async () => {
      const { mockEventListener } = await setup({
        card: TEST_NATIVE_CARD,
      });

      await triggerNativeQueryChange();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should trigger beforeunload event when user tries to leave an ad-hoc native query", async () => {
      const { mockEventListener } = await setup({
        card: TEST_UNSAVED_NATIVE_CARD,
      });

      await triggerNativeQueryChange();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(BEFORE_UNLOAD_UNSAVED_MESSAGE);
    });

    it("should not trigger beforeunload event when query is unedited", async () => {
      const { mockEventListener } = await setup({
        card: TEST_NATIVE_CARD,
      });

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(undefined);
    });
  });

  describe("editing notebook questions", () => {
    it("should not trigger beforeunload event when leaving edited question which will turn the question ad-hoc", async () => {
      const { mockEventListener } = await setup({
        card: TEST_STRUCTURED_CARD,
      });

      expect(screen.queryByText("Count")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("Summarize"));
      await userEvent.click(await screen.findByText("Done"));
      expect(await screen.findByText("Count")).toBeInTheDocument();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(undefined);
    });

    it("should not trigger beforeunload event when user tries to leave an ad-hoc structured query", async () => {
      const { mockEventListener } = await setup({
        card: TEST_UNSAVED_STRUCTURED_CARD,
      });

      expect(screen.queryByText("Count")).not.toBeInTheDocument();
      await userEvent.click(await screen.findByText("Summarize"));
      await userEvent.click(await screen.findByText("Done"));
      expect(await screen.findByText("Count")).toBeInTheDocument();

      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(undefined);
    });

    it("should not trigger beforeunload event when query is unedited", async () => {
      const { mockEventListener } = await setup({
        card: TEST_STRUCTURED_CARD,
      });

      expect(
        await screen.findByText(TEST_STRUCTURED_CARD.name),
      ).toBeInTheDocument();
      const mockEvent = callMockEvent(mockEventListener, "beforeunload");
      expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      expect(mockEvent.returnValue).toEqual(undefined);
    });
  });
});
