import { renderWithProviders, screen } from "__support__/ui";
import type { LibraryCollectionType } from "metabase-types/api";

import { LibraryUpsellPage } from "./LibraryUpsellPage";

type SetupOpts = {
  section?: LibraryCollectionType;
};

function setup({ section }: SetupOpts = {}) {
  renderWithProviders(<LibraryUpsellPage section={section} />, {
    withRouter: true,
  });
}

describe("LibraryUpsellPage", () => {
  it.each([
    { section: undefined, header: "Semantic layer" },
    { section: "library" as const, header: "Semantic layer" },
    { section: "library-dashboards" as const, header: "Dashboards" },
    { section: "library-documents" as const, header: "Documents" },
  ])("names the $header entry in its breadcrumb", ({ section, header }) => {
    setup({ section });

    expect(screen.getByTestId("data-studio-breadcrumbs")).toHaveTextContent(
      header,
    );
    expect(
      screen.getByText("Bring more order to your analytics"),
    ).toBeInTheDocument();
  });
});
