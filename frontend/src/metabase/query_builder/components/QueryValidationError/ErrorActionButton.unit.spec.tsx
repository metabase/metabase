import React from "react";
import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/ValidationError";

import {
  ErrorActionButton,
  BUTTON_ACTIONS,
  ErrorActionButtonProps,
} from "./ErrorActionButton";

function setup({
  error = new ValidationError(
    "oof",
    VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
  ),
  uiControls = { isShowingTemplateTagsEditor: false },
  toggleTemplateTagsEditor = jest.fn(),
  ...props
}: Partial<ErrorActionButtonProps> = {}) {
  render(
    <ErrorActionButton
      error={error}
      uiControls={uiControls}
      toggleTemplateTagsEditor={toggleTemplateTagsEditor}
      {...props}
    />,
  );
  return { toggleTemplateTagsEditor };
}

describe("ErrorActionButton", () => {
  describe("when using an error that does not have an associated action", () => {
    const errorWithoutType = new ValidationError("oof"); // undefined action type

    it("should not render an action button", () => {
      setup({ error: errorWithoutType });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when using an error with an associated action", () => {
    const [buttonLabel] =
      BUTTON_ACTIONS[VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION];

    it("should render an action button using the button label it is mapped to", () => {
      setup();
      const button = screen.getByRole("button", { name: buttonLabel });
      expect(button).toBeInTheDocument();
    });
  });

  describe("when clicking an ErrorActionButton mapped to the MISSING_TAG_DIMENSION validation error", () => {
    const validationError = new ValidationError(
      "oof",
      VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
    );
    const [buttonLabel] =
      BUTTON_ACTIONS[VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION];

    describe("when `isShowingTemplateTagsEditor` is falsy", () => {
      it("should call the toggleTemplateTagsEditor action", () => {
        const { toggleTemplateTagsEditor } = setup({ error: validationError });

        userEvent.click(
          screen.getByRole("button", {
            name: buttonLabel,
          }),
        );

        expect(toggleTemplateTagsEditor).toHaveBeenCalled();
      });
    });

    describe("when `isShowingTemplateTagsEditor` is true", () => {
      it("should not call the toggleTemplateTagsEditor action", () => {
        const { toggleTemplateTagsEditor } = setup({
          error: validationError,
          uiControls: { isShowingTemplateTagsEditor: true },
        });

        userEvent.click(
          screen.getByRole("button", {
            name: buttonLabel,
          }),
        );

        expect(toggleTemplateTagsEditor).not.toHaveBeenCalled();
      });
    });
  });
});
