import React from "react";
import { renderWithProviders, screen } from "__support__/ui";

import ValidationError, {
  VALIDATION_ERROR_TYPES,
} from "metabase-lib/lib/ValidationError";

import QueryValidationError from "./QueryValidationError";

const providers = {
  reducers: {
    qb: () => ({}),
  },
};

describe("QueryValidationError", () => {
  describe("when using an Error", () => {
    const error = new Error("oof");
    beforeEach(() => {
      renderWithProviders(<QueryValidationError error={error} />, providers);
    });

    it("should render the error message", () => {
      expect(screen.getByText("oof")).toBeInTheDocument();
    });

    it("should not render an action button because there is no associated action", () => {
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("when using a ValidationError with an associated action", () => {
    const validationError = new ValidationError(
      "oof",
      VALIDATION_ERROR_TYPES.MISSING_TAG_DIMENSION,
    );
    beforeEach(() => {
      renderWithProviders(
        <QueryValidationError error={validationError} />,
        providers,
      );
    });

    it("should render the error message", () => {
      expect(screen.getByText("oof")).toBeInTheDocument();
    });

    it("should render an action button", () => {
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
