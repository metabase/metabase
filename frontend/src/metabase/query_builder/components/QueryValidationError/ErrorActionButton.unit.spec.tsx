import { render, screen } from "__support__/ui";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/ValidationError";

import type { ErrorActionButtonProps } from "./ErrorActionButton";
import { ErrorActionButton, BUTTON_ACTIONS } from "./ErrorActionButton";

function setup({
  error = new ValidationError(
    "oof",
    VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
  ),
  uiControls = { isShowingTemplateTagsEditor: false },
  ...props
}: Partial<ErrorActionButtonProps> = {}) {
  render(
    <ErrorActionButton error={error} uiControls={uiControls} {...props} />,
  );
  return {};
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
});
