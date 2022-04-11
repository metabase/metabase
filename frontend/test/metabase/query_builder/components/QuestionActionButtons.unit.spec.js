import React from "react";
import { renderWithProviders, screen } from "__support__/ui";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import QuestionActionButtons, {
  EDIT_TESTID,
  ADD_TO_DASH_TESTID,
  MOVE_TESTID,
  CLONE_TESTID,
  ARCHIVE_TESTID,
} from "metabase/query_builder/components/QuestionActionButtons";

const testIdActionPairs = [
  [EDIT_TESTID, MODAL_TYPES.EDIT],
  [ADD_TO_DASH_TESTID, MODAL_TYPES.ADD_TO_DASHBOARD],
  [MOVE_TESTID, MODAL_TYPES.MOVE],
  [CLONE_TESTID, MODAL_TYPES.CLONE],
  [ARCHIVE_TESTID, MODAL_TYPES.ARCHIVE],
];

function setup({
  canWrite = true,
  onOpenModal = jest.fn(),
  areNestedQueriesEnabled = true,
  questionDatabaseSupportsModels = true,
  isDataModel = false,
} = {}) {
  const question = {
    query: () => ({
      database: () => ({
        hasFeature: feature =>
          feature === "nested-queries" ? questionDatabaseSupportsModels : true,
      }),
    }),
    isDataset: () => isDataModel,
  };

  const settingsState = {
    values: { "enable-nested-queries": areNestedQueriesEnabled },
  };

  renderWithProviders(
    <QuestionActionButtons
      question={question}
      canWrite={canWrite}
      onOpenModal={onOpenModal}
    />,
    {
      storeInitialState: {
        settings: settingsState,
      },
      reducers: {
        settings: () => settingsState,
      },
    },
  );

  return { onOpenModal };
}

describe("QuestionActionButtons", () => {
  describe("when `canWrite` is falsy", () => {
    it("only renders the 'add to dashboard' and 'bookmark' buttons", () => {
      setup({ canWrite: false });
      const buttons = screen.getAllByRole("button");

      screen.getByTestId(ADD_TO_DASH_TESTID);
      expect(buttons.length).toBe(2);
    });

    it("should pass the correct action to the `onOpenModal` prop", () => {
      const { onOpenModal } = setup({ canWrite: false });
      screen.getByTestId(ADD_TO_DASH_TESTID).click();
      expect(onOpenModal).toHaveBeenCalledWith(MODAL_TYPES.ADD_TO_DASHBOARD);
    });

    it("shouldn't show the control for turning question into model", () => {
      setup({ canWrite: false });
      expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
    });
  });

  describe("when `canWrite` is truthy", () => {
    it("should show all buttons", () => {
      setup();
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(7);
    });

    it("should pass the correct action to the `onOpenModal`", () => {
      const { onOpenModal } = setup();

      testIdActionPairs.forEach(([testId, action]) => {
        const button = screen.getByTestId(testId);
        button.click();
        expect(onOpenModal).toHaveBeenCalledWith(action);
        onOpenModal.mockClear();
      });
    });

    it("should show the control for turning question into model", () => {
      setup();
      expect(screen.getByLabelText("model icon")).toBeInTheDocument();
    });
  });

  describe("when database supports models", () => {
    it("should show the control for turning question into model", () => {
      setup();
      expect(screen.getByLabelText("model icon")).toBeInTheDocument();
    });
  });

  describe("when database doesn't support models", () => {
    it("shouldn't show the control for turning question into model", () => {
      setup({ questionDatabaseSupportsModels: false });
      expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
    });
  });

  describe("when nested queries are disabled", () => {
    it("shouldn't show the control for turning question into model", () => {
      setup({ areNestedQueriesEnabled: false });
      expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
    });
  });

  describe("when displaying model actions", () => {
    it("shouldn't show the control for turning question into model", () => {
      setup({ isDataModel: true });
      expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
    });
  });
});
