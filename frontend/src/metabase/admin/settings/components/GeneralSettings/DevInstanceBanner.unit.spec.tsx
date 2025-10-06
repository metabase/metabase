import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DevInstanceBanner } from "./DevInstanceBanner";

interface SetupOpts {
  isDevMode?: boolean;
  isHosted?: boolean;
}

const setup = ({ isDevMode = false, isHosted = false }: SetupOpts = {}) => {
  const settings = createMockSettings({
    "development-mode?": isDevMode,
    "is-hosted?": isHosted,
  });

  const state = createMockState({
    settings: mockSettings(settings),
  });

  renderWithProviders(<DevInstanceBanner />, {
    storeInitialState: state,
  });
};

describe("DevInstanceBanner", () => {
  it("should not render when development mode is disabled", () => {
    setup({ isDevMode: false, isHosted: false });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should render for hosted instances", () => {
    setup({ isDevMode: true, isHosted: true });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        /This instance is in development mode and can be used for development or testing purposes only./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage instance" }),
    ).toBeInTheDocument();
  });

  it("should render for self-hosted instances", () => {
    setup({ isDevMode: true, isHosted: false });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByText(
        /This instance is in development mode and can be used for development or testing purposes only. To spin up more development instances, use your development license token./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get your token" }),
    ).toBeInTheDocument();
  });
});
