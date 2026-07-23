import { renderWithProviders, screen, within } from "__support__/ui";

import { GuidePage } from "./GuidePage";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <div data-testid="app-switcher" />,
}));

describe("GuidePage", () => {
  it("renders the page header, title, and sections", () => {
    renderWithProviders(<GuidePage />);

    expect(screen.getByTestId("data-studio-breadcrumbs")).toHaveTextContent(
      "Guide",
    );
    expect(screen.getByTestId("app-switcher")).toBeInTheDocument();
    expect(
      screen.getByText("Build your semantic layer in Data Studio"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Transform your data to make it easier to query"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Publish query-ready tables to the Semantic Layer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Define key metrics and terms"),
    ).toBeInTheDocument();
  });

  it("shows brand icons next to each section heading", () => {
    renderWithProviders(<GuidePage />);

    expect(
      within(screen.getByTestId("guide-transforms-section")).getByLabelText(
        "transform icon",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("guide-publish-section")).getByLabelText(
        "repository icon",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("guide-define-section")).getByLabelText(
        "metric icon",
      ),
    ).toBeInTheDocument();
  });

  it("shows section content without action buttons", () => {
    renderWithProviders(<GuidePage />);

    expect(screen.getByTestId("guide-transforms-section")).toHaveTextContent(
      /Use Transforms to write new tables/,
    );
    expect(screen.getByTestId("guide-publish-section")).toHaveTextContent(
      /Find all your tables in Connected data/,
    );
    expect(screen.getByTestId("guide-define-section")).toHaveTextContent(
      /Build on tables’ segments and measures/,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
