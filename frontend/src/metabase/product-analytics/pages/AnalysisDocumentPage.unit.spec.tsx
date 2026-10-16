import userEvent from "@testing-library/user-event";

import {
  setupDatabaseListEndpoint,
  setupTablesEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

import { PROTOTYPE_DATABASE_NAME, PROTOTYPE_TABLE_NAME } from "../config";

import { AnalysisDocumentPage } from "./AnalysisDocumentPage";

const DATABASE = createMockDatabase({
  id: 1,
  name: PROTOTYPE_DATABASE_NAME,
  engine: "clickhouse",
});

const TABLE = createMockTable({
  id: 10,
  db_id: DATABASE.id,
  name: PROTOTYPE_TABLE_NAME,
  display_name: "Events",
  fields: [
    createMockField({ id: 1, table_id: 10, name: "user_id" }),
    createMockField({
      id: 2,
      table_id: 10,
      name: "ts",
      base_type: "type/DateTime",
    }),
    createMockField({ id: 3, table_id: 10, name: "event_name" }),
  ],
});

const setup = () => {
  setupDatabaseListEndpoint([DATABASE]);
  setupTablesEndpoints([TABLE]);

  renderWithProviders(
    <Route path="/event-analysis/new" element={<AnalysisDocumentPage />} />,
    { withRouter: true, initialRoute: "/event-analysis/new" },
  );
};

const getGalleryCard = (name: RegExp) => screen.findByRole("button", { name });

describe("AnalysisDocumentPage", () => {
  it("adds an analysis from the gallery in edit mode, and leaves edit mode on Done", async () => {
    setup();

    expect(
      await screen.findByRole("button", { name: /Events/ }),
    ).toBeInTheDocument();
    const funnelCard = await getGalleryCard(/Funnel/);
    await waitFor(() => expect(funnelCard).toBeEnabled());

    await userEvent.click(funnelCard);

    expect(
      await screen.findByTestId("product-analysis-node"),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Steps" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Insights" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Paths/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: "Steps" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Done" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit analysis" }),
    ).toBeInTheDocument();
  });

  it("enters edit mode from the card's edit button", async () => {
    setup();
    const funnelCard = await getGalleryCard(/Funnel/);
    await waitFor(() => expect(funnelCard).toBeEnabled());
    await userEvent.click(funnelCard);
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit analysis" }),
    );

    expect(
      await screen.findByRole("button", { name: "Done" }),
    ).toBeInTheDocument();
  });
});
