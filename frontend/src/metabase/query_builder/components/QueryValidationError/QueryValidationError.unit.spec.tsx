import { renderWithProviders, screen } from "__support__/ui";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/ValidationError";

import QueryValidationError from "./QueryValidationError";

describe("QueryValidationError", () => {
  describe("when using an Error", () => {
    const error = new Error("oof");

    it("should render the error message", () => {
      renderWithProviders(<QueryValidationError error={error} />);
      expect(screen.getByText("oof")).toBeInTheDocument();
    });

    it("should not render an action button because there is no associated action", () => {
      renderWithProviders(<QueryValidationError error={error} />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when using a ValidationError with an associated action", () => {
    const validationError = new ValidationError(
      "oof",
      VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
    );

    it("should render the error message", () => {
      renderWithProviders(<QueryValidationError error={validationError} />);
      expect(screen.getByText("oof")).toBeInTheDocument();
    });

    it("should render an action button", () => {
      renderWithProviders(<QueryValidationError error={validationError} />);
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
