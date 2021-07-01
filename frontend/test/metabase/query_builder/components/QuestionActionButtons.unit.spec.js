import React from "react";

import "@testing-library/jest-dom/extend-expect";
import { render, screen } from "@testing-library/react";

import QuestionActionButtons, {
  EDIT_TESTID,
  ADD_TO_DASH_TESTID,
  MOVE_TESTID,
  CLONE_TESTID,
  ARCHIVE_TESTID,
  EDIT_ACTION,
  ADD_TO_DASH_ACTION,
  MOVE_ACTION,
  CLONE_ACTION,
  ARCHIVE_ACTION,
} from "metabase/query_builder/components/QuestionActionButtons";

const testIdActionPairs = [
  [EDIT_TESTID, EDIT_ACTION],
  [ADD_TO_DASH_TESTID, ADD_TO_DASH_ACTION],
  [MOVE_TESTID, MOVE_ACTION],
  [CLONE_TESTID, CLONE_ACTION],
  [ARCHIVE_TESTID, ARCHIVE_ACTION],
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

      expect(onOpenModal).toHaveBeenCalledWith(ADD_TO_DASH_ACTION);
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
