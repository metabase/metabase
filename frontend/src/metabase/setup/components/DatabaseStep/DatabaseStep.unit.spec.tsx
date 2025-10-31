import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { SetupStep } from "metabase/setup/types";
import type { DatabaseData } from "metabase-types/api";
import { createMockDatabaseData } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseStep } from "./DatabaseStep";

interface SetupOpts {
  step?: SetupStep;
  database?: DatabaseData;
  isEmailConfigured?: boolean;
}

const setup = ({
  step = "db_connection",
  database,
  isEmailConfigured = false,
}: SetupOpts = {}) => {
  const state = createMockState({
    setup: createMockSetupState({
      step,
      database,
    }),
    settings: createMockSettingsState({
      "email-configured?": isEmailConfigured,
    }),
  });

  renderWithProviders(<DatabaseStep stepLabel={0} />, {
    storeInitialState: state,
  });
};

describe("DatabaseStep", () => {
  it("should render in active state", () => {
    setup();

    expect(screen.getByText("Add your data")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    setup({
      step: "data_usage",
      database: createMockDatabaseData({ name: "Test" }),
    });

    expect(screen.getByText("Connecting to Test")).toBeInTheDocument();
  });

  it("should render a user invite form", async () => {
    setup({
      isEmailConfigured: true,
    });

    expect(
      screen.getByText("Need help connecting to your data?"),
    ).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("button", { name: "Setup section" })).getByRole(
        "img",
        { name: "chevrondown icon" },
      ),
    );

    expect(screen.getByTestId("invite-user-form")).toBeInTheDocument();
  });

  it("should handle status properly when invitation request fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    setup({
      isEmailConfigured: true,
    });

    const chevronDownIcon = within(
      screen.getByRole("button", { name: "Setup section" }),
    ).getByRole("img", { name: "chevrondown icon" });

    await userEvent.click(chevronDownIcon);

    const form = screen.getByTestId("invite-user-form");

    expect(within(form).getByRole("button")).toBeDisabled();

    await userEvent.type(within(form).getByLabelText("First name"), "Jack");
    await userEvent.type(within(form).getByLabelText("Last name"), "Chan");
    await userEvent.type(
      within(form).getByLabelText("Email"),
      "jack.chan@example.com",
    );

    expect(within(form).getByRole("button")).toBeEnabled();

    fetchMock.postOnce("/api/user", {
      status: 400,
      body: {
        errors: {
          email: "This email is not valid",
        },
      },
    });
    await userEvent.click(within(form).getByRole("button"));
    await within(form).findByRole("button", { name: "Failed" });
    await within(form).findByText(/This email is not valid/);
  });
});
