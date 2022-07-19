import React from "react";
import { render, screen } from "__support__/ui";
import userEvent from "@testing-library/user-event";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/lib/ValidationError";

import {
  ErrorActionButton,
  BUTTON_ACTIONS,
  ErrorActionButtonProps,
} from "./ErrorActionButton";

let props: ErrorActionButtonProps;
describe("ErrorActionButton", () => {
  beforeEach(() => {
    props = {
      error: new ValidationError(
        "oof",
        VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
      ),
      uiControls: {
        isShowingTemplateTagsEditor: false,
      },
      toggleTemplateTagsEditor: jest.fn(),
    };
  });

  describe("when using an error that does not have an associated action", () => {
    const errorWithoutType = new ValidationError("oof"); // undefined action type
    beforeEach(() => {
      props.error = errorWithoutType;
      render(<ErrorActionButton {...props} />);
    });

    it("should not render an action button", () => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when using an error with an associated action", () => {
    const [buttonLabel] =
      BUTTON_ACTIONS[VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION];

    beforeEach(() => {
      render(<ErrorActionButton {...props} />);
    });

    it("should render an action button using the button label it is mapped to", () => {
      expect(
        screen.getByRole("button", {
          name: buttonLabel,
        }),
      ).toBeInTheDocument();
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
      beforeEach(() => {
        props.error = validationError;
        render(<ErrorActionButton {...props} />);
      });

      it("should call the toggleTemplateTagsEditor action", () => {
        userEvent.click(
          screen.getByRole("button", {
            name: buttonLabel,
          }),
        );
        expect(props.toggleTemplateTagsEditor).toHaveBeenCalled();
      });
    });

    describe("when `isShowingTemplateTagsEditor` is true", () => {
      beforeEach(() => {
        props.error = validationError;
        props.uiControls.isShowingTemplateTagsEditor = true;
        render(<ErrorActionButton {...props} />);
      });

      it("should not call the toggleTemplateTagsEditor action", () => {
        userEvent.click(
          screen.getByRole("button", {
            name: buttonLabel,
          }),
        );
        expect(props.toggleTemplateTagsEditor).not.toHaveBeenCalled();
      });
    });
  });
});
