import React from "react";
import { render, screen } from "@testing-library/react";

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

describe("QuestionActionButtons", () => {
  let onOpenModal;
  beforeEach(() => {
    onOpenModal = jest.fn();
  });

  describe("when `canWrite` is falsy", () => {
    beforeEach(() => {
      const canWrite = false;
      render(
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />,
      );
    });

    it("only renders the 'add to dashboard'' button", () => {
      screen.getByTestId(ADD_TO_DASH_TESTID);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(1);
    });

    it("should pass the correct action to the `onOpenModal` prop", () => {
      const button = screen.getByTestId(ADD_TO_DASH_TESTID);
      button.click();

      expect(onOpenModal).toHaveBeenCalledWith(MODAL_TYPES.ADD_TO_DASHBOARD);
    });
  });

  describe("when `canWrite` is truthy", () => {
    beforeEach(() => {
      const canWrite = true;
      render(
        <QuestionActionButtons canWrite={canWrite} onOpenModal={onOpenModal} />,
      );
    });

    it("should show all buttons", () => {
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBe(5);
    });

    it("should pass the correct action to the `onOpenModal`", () => {
      testIdActionPairs.forEach(([testId, action]) => {
        const button = screen.getByTestId(testId);
        button.click();

        expect(onOpenModal).toHaveBeenCalledWith(action);
        onOpenModal.mockClear();
      });
    });
  });
});
