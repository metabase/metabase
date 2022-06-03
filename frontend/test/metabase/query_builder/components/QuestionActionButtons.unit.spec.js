import React from "react";
import { renderWithProviders, screen } from "__support__/ui";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import QuestionActionButtons, {
  EDIT_TESTID,
} from "metabase/query_builder/components/QuestionActionButtons";

const testIdActionPairs = [[EDIT_TESTID, MODAL_TYPES.EDIT]];

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
        supportsPersistence: () => false,
        isPersisted: () => false,
      }),
    }),
    isDataset: () => isDataModel,
    isSaved: () => true,
    isPersisted: () => false,
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
      const buttons = screen.queryAllByRole("button");
      expect(buttons.length).toBe(0);
    });
  });

  describe("when `canWrite` is truthy", () => {
    it("should show all buttons", () => {
      setup();
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(1);
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
  });

  // describe("when database supports models", () => {
  //   it("should show the control for turning question into model", () => {
  //     setup();
  //     expect(screen.getByLabelText("model icon")).toBeInTheDocument();
  //   });
  // });

  // describe("when database doesn't support models", () => {
  //   it("shouldn't show the control for turning question into model", () => {
  //     setup({ questionDatabaseSupportsModels: false });
  //     expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
  //   });
  // });

  // describe("when nested queries are disabled", () => {
  //   it("shouldn't show the control for turning question into model", () => {
  //     setup({ areNestedQueriesEnabled: false });
  //     expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
  //   });
  // });

  // describe("when displaying model actions", () => {
  //   it("shouldn't show the control for turning question into model", () => {
  //     setup({ isDataModel: true });
  //     expect(screen.queryByLabelText("model icon")).not.toBeInTheDocument();
  //   });
  // });
});
