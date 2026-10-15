import { useContext } from "react";

import { setupDocumentEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockDocument } from "metabase-types/api/mocks";

import {
  DOCUMENTS_COLLECTION,
  setupLibraryCollectionEndpoints,
} from "../../../test-utils";

import { DocumentDependenciesPage } from "./DocumentDependenciesPage";

const DOCUMENT = createMockDocument({
  id: 10,
  name: "Quarterly review",
  collection: DOCUMENTS_COLLECTION,
});

const DEPENDENCIES_PATH = `/data-studio/documents/${DOCUMENT.id}/dependencies`;

function GraphContextProbe() {
  const { baseUrl, defaultEntry } = useContext(
    PLUGIN_DEPENDENCIES.DependencyGraphPageContext,
  );
  return (
    <div data-testid="graph-context">
      {JSON.stringify({ baseUrl, defaultEntry })}
    </div>
  );
}

function setup() {
  setupDocumentEndpoints(DOCUMENT);
  setupLibraryCollectionEndpoints();

  renderWithProviders(
    <Route
      path="/data-studio/documents/:documentId/dependencies"
      element={<DocumentDependenciesPage />}
    >
      <Route index element={<GraphContextProbe />} />
    </Route>,
    { withRouter: true, initialRoute: DEPENDENCIES_PATH },
  );
}

describe("DocumentDependenciesPage", () => {
  it("opens the dependency graph on the document", async () => {
    setup();

    const graphContext = await screen.findByTestId("graph-context");
    expect(JSON.parse(graphContext.textContent ?? "")).toEqual({
      baseUrl: DEPENDENCIES_PATH,
      defaultEntry: { id: DOCUMENT.id, type: "document" },
    });
  });

  it("shows the document header above the graph", async () => {
    setup();

    expect(await screen.findByTestId("document-pane-header")).toHaveTextContent(
      "Quarterly review",
    );
  });
});
