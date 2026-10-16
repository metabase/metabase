import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { lazyLoaders } from "__support__/lazy-routes";
import {
  setupDocumentEndpoints,
  setupDocumentRevisionsEndpoint,
} from "__support__/server-mocks";
import { setupDependencyGraphEndpoint } from "__support__/server-mocks/dependencies";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import {
  createMockDependencyGraph,
  createMockDocument,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../test-utils";

import { getDataStudioDocumentRoutes } from "./routes";

const DOCUMENT = createMockDocument({
  id: 10,
  name: "Quarterly review",
  collection: DOCUMENTS_COLLECTION,
});
const HISTORY_PATH = "/data-studio/documents/10/history";
const DEPENDENCIES_PATH = "/data-studio/documents/10/dependencies";

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
  setupDocumentEndpoints(DOCUMENT);
  setupDocumentRevisionsEndpoint(DOCUMENT.id, []);
  setupLibraryCollectionEndpoints();
  setupDependencyGraphEndpoint(createMockDependencyGraph());

  renderWithProviders(
    <>
      <Route path="/data-studio">{getDataStudioDocumentRoutes()}</Route>
      <Route path="*" element={<div>No route matched</div>} />
    </>,
    { withRouter: true, initialRoute },
  );
}

describe("Data Studio document routes without plugins", () => {
  it("resolves every page", async () => {
    reinitialize();
    const loaders = lazyLoaders(getDataStudioDocumentRoutes());

    expect(loaders).toHaveLength(4);
    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it("renders the History page with its tab selected", async () => {
    setup({ initialRoute: HISTORY_PATH });

    expect(
      await screen.findByTestId("document-history-page"),
    ).toBeInTheDocument();
    const header = screen.getByTestId("document-pane-header");
    expect(
      within(header).getByRole("link", { name: "History" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("has no Dependencies page", async () => {
    setup({ initialRoute: DEPENDENCIES_PATH });

    expect(await screen.findByText("No route matched")).toBeInTheDocument();
  });
});

describe("Data Studio document routes with the dependencies plugin", () => {
  it("renders the Dependencies page with its tab selected", async () => {
    setup({ initialRoute: DEPENDENCIES_PATH, hasDependenciesPlugin: true });

    expect(
      await screen.findByTestId("document-dependencies-page"),
    ).toBeInTheDocument();
    const header = screen.getByTestId("document-pane-header");
    expect(
      within(header).getByRole("link", { name: "Dependencies" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("No route matched")).not.toBeInTheDocument();
  });
});
