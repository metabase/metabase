import { renderWithProviders, screen } from "__support__/ui";

import { DataStudioPaneHeader } from "./DataStudioPaneHeader";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <button>Switch apps</button>,
}));

jest.mock("./MetabotDataStudioButton", () => ({
  MetabotDataStudioButton: () => <button>Open Metabot</button>,
}));

describe("DataStudioPaneHeader", () => {
  it("shows the app switcher by default", () => {
    renderWithProviders(<DataStudioPaneHeader breadcrumbs="Breadcrumbs" />);

    expect(
      screen.getByRole("button", { name: "Switch apps" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Metabot" }),
    ).not.toBeInTheDocument();
  });

  it("lets pages opt into Metabot", () => {
    renderWithProviders(
      <DataStudioPaneHeader breadcrumbs="Breadcrumbs" showMetabotButton />,
    );

    expect(
      screen.getByRole("button", { name: "Switch apps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Metabot" }),
    ).toBeInTheDocument();
  });

  it("lets pages hide both controls", () => {
    renderWithProviders(
      <DataStudioPaneHeader
        breadcrumbs="Breadcrumbs"
        showAppSwitcher={false}
        showMetabotButton={false}
      />,
    );

    expect(screen.getByText("Breadcrumbs")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch apps" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Metabot" }),
    ).not.toBeInTheDocument();
  });

  it("lets pages show Metabot without the app switcher", () => {
    renderWithProviders(
      <DataStudioPaneHeader
        breadcrumbs="Breadcrumbs"
        showAppSwitcher={false}
        showMetabotButton
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open Metabot" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch apps" }),
    ).not.toBeInTheDocument();
  });
});
