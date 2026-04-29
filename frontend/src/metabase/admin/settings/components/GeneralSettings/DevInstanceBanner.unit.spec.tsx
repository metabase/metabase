import { createScenario } from "__support__/scenarios";
import { screen } from "__support__/ui";

import { DevInstanceBanner } from "./DevInstanceBanner";

interface SetupOpts {
  isDevMode?: boolean;
  isHosted?: boolean;
}

const setup = ({ isDevMode = false, isHosted = false }: SetupOpts = {}) => {
  const { render } = createScenario()
    .withSettings({
      "development-mode?": isDevMode,
      "is-hosted?": isHosted,
    })
    .build();

  render(<DevInstanceBanner />);
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
