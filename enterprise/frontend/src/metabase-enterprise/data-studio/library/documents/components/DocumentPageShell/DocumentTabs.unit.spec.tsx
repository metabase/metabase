import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { DocumentTabs } from "./DocumentTabs";

const DOCUMENT_ID = 10;

type SetupOpts = {
  initialRoute: string;
  hasDependenciesPlugin?: boolean;
};

function setup({ initialRoute, hasDependenciesPlugin = false }: SetupOpts) {
  reinitialize();
  if (hasDependenciesPlugin) {
    mockSettings({
      "token-features": createMockTokenFeatures({ dependencies: true }),
    });
    setupEnterpriseOnlyPlugin("dependencies");
  }
  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId/*"
      element={<DocumentTabs documentId={DOCUMENT_ID} />}
    />,
    { withRouter: true, initialRoute },
  );
}

function getTabLabels() {
  return within(screen.getByRole("navigation"))
    .getAllByRole("link")
    .map((link) => link.getAttribute("aria-label"));
}

describe("DocumentTabs without the dependencies plugin", () => {
  it("shows the Overview, Contents and History tabs in order", () => {
    setup({ initialRoute: "/data-studio/documents/10" });

    expect(getTabLabels()).toEqual(["Overview", "Contents", "History"]);
  });

  it.each([
    { tab: "Overview", path: "/data-studio/documents/10" },
    { tab: "Contents", path: "/data-studio/documents/10/contents" },
    { tab: "History", path: "/data-studio/documents/10/history" },
  ])("links $tab to $path and selects it there", ({ tab, path }) => {
    setup({ initialRoute: path });

    const link = screen.getByRole("link", { name: tab });
    expect(link).toHaveAttribute("href", path);
    expect(link).toHaveAttribute("aria-current", "page");
  });
});

describe("DocumentTabs with the dependencies plugin", () => {
  it("puts the Dependencies tab between Contents and History", () => {
    setup({
      initialRoute: "/data-studio/documents/10/dependencies",
      hasDependenciesPlugin: true,
    });

    expect(getTabLabels()).toEqual([
      "Overview",
      "Contents",
      "Dependencies",
      "History",
    ]);
    expect(screen.getByRole("link", { name: "Dependencies" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
