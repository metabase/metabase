import userEvent from "@testing-library/user-event";

import { setupUserKeyValueEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";

import type { QueryValidationResult } from "../types";

import { EditorValidationCard } from "./EditorValidationCard";
import { TRANSFORM_ERROR_SEEN_KEY } from "./constants";

const VALID_RESULT = {
  isValid: true,
};

const ERROR_RESULT = {
  isValid: false,
  errorMessage: "Error message",
};

type SetupOpts = {
  validationResult: QueryValidationResult;
  hasSeen?: boolean;
};

function setup({ validationResult, hasSeen = false }: SetupOpts) {
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: TRANSFORM_ERROR_SEEN_KEY,
    value: hasSeen,
  });

  renderWithProviders(
    <EditorValidationCard validationResult={validationResult} />,
  );
}

describe("EditorValidationCard", () => {
  it("should not show the error when the result is valid", () => {
    setup({ validationResult: VALID_RESULT, hasSeen: false });
    expect(screen.queryByText("Okay")).not.toBeInTheDocument();
  });

  it("should not show the error when the user has already seen it", () => {
    setup({ validationResult: ERROR_RESULT, hasSeen: true });
    expect(
      screen.queryByText(ERROR_RESULT.errorMessage),
    ).not.toBeInTheDocument();
  });

  it("should show the error if it was not seen before", async () => {
    setup({ validationResult: ERROR_RESULT, hasSeen: false });
    expect(
      await screen.findByText(ERROR_RESULT.errorMessage),
    ).toBeInTheDocument();
  });

  it("should hide the error when the user clicks the button", async () => {
    setup({ validationResult: ERROR_RESULT, hasSeen: false });
    await userEvent.click(await screen.findByText("Okay"));
    expect(
      screen.queryByText(ERROR_RESULT.errorMessage),
    ).not.toBeInTheDocument();
  });
});
