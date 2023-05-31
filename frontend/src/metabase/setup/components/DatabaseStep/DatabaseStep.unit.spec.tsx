import { DatabaseData } from "metabase-types/api";
import { createMockDatabaseData } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { DATABASE_STEP, PREFERENCES_STEP } from "../../constants";
import { DatabaseStep } from "./DatabaseStep";

interface SetupOpts {
  step?: number;
  database?: DatabaseData;
  isEmailConfigured?: boolean;
}

const setup = ({
  step = DATABASE_STEP,
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

  renderWithProviders(<DatabaseStep />, { storeInitialState: state });
};

describe("DatabaseStep", () => {
  it("should render in active state", () => {
    setup();

    expect(screen.getByText("Add your data")).toBeInTheDocument();
  });

  it("should render in completed state", () => {
    setup({
      step: PREFERENCES_STEP,
      database: createMockDatabaseData({ name: "Test" }),
    });

    expect(screen.getByText("Connecting to Test")).toBeInTheDocument();
  });

  it("should render a user invite form", () => {
    setup({
      isEmailConfigured: true,
    });

    expect(
      screen.getByText("Need help connecting to your data?"),
    ).toBeInTheDocument();
  });
});
