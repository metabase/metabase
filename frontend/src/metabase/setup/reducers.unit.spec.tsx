/**
 * @jest-environment-options {"url": "http://localhost/setup?first_name=John&last_name=Doe&email=john@doe.test&site_name=Doe%20Unlimited"}
 */
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";

import { selectStep } from "./actions";
import { UserStep } from "./components/UserStep";
import { reducer } from "./reducers";

describe("setup reducer", () => {
  it("should pre-fill the user form from the URL query params (infra-frontend#1109)", () => {
    const state = createMockState({
      settings: mockSettings({ "is-hosted?": true }),
      setup: reducer(undefined, selectStep("user_info")),
    });

    renderWithProviders(<UserStep stepLabel={1} />, {
      storeInitialState: state,
    });

    expect(screen.getByLabelText("First name")).toHaveValue("John");
    expect(screen.getByLabelText("Last name")).toHaveValue("Doe");
    expect(screen.getByLabelText("Email")).toHaveValue("john@doe.test");
    expect(screen.getByLabelText("Company or team name")).toHaveValue(
      "Doe Unlimited",
    );
    expect(screen.getByLabelText("Create a password")).toHaveValue("");
  });
});
