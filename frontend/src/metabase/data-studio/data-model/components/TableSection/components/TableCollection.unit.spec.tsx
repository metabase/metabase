import { Route } from "react-router";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { Collection, Table } from "metabase-types/api";
import {
  createMockCollection,
  createMockTable,
} from "metabase-types/api/mocks";

import { TableCollection } from "./TableCollection";

const ROOT_ANCESTOR = createMockCollection({
  id: "root",
  name: "Our analytics",
});
const LIBRARY = createMockCollection({ id: 5, name: "Library" });
const DATA = createMockCollection({ id: 6, name: "Data" });

function setup({
  collection,
  ancestors,
}: {
  collection: Collection | null;
  ancestors?: Collection[];
}) {
  const table: Table = createMockTable({
    collection_id: collection?.id ?? null,
    collection: collection ?? undefined,
  });

  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ id: "root", name: "Our analytics" }),
      ...(collection
        ? [{ ...collection, effective_ancestors: ancestors ?? [] }]
        : []),
    ],
  });

  renderWithProviders(
    <Route path="/" component={() => <TableCollection table={table} />} />,
    { withRouter: true },
  );
}

describe("TableCollection", () => {
  it("links a nested published collection to the library expanded down to that collection (metabase#UXW-4171)", async () => {
    const ordersCollection = createMockCollection({
      id: 8,
      name: "Orders collection",
    });

    setup({
      collection: ordersCollection,
      ancestors: [ROOT_ANCESTOR, LIBRARY, DATA],
    });

    const link = await screen.findByRole("link", {
      name: "Orders collection",
    });

    // Must expand the Data root (6) AND the collection itself (8) so the
    // referenced collection is actually revealed — not just the library root.
    expect(link).toHaveAttribute(
      "href",
      "/data-studio/library?expandedId=6&expandedId=8",
    );
  });

  it("links a top-level published collection to the library expanded to it", async () => {
    const dataCollection = createMockCollection({ id: 6, name: "Data" });

    setup({
      collection: dataCollection,
      ancestors: [ROOT_ANCESTOR, LIBRARY],
    });

    const link = await screen.findByRole("link", { name: "Data" });

    expect(link).toHaveAttribute("href", "/data-studio/library?expandedId=6");
  });

  it("shows a no-access message when the collection is not available", () => {
    setup({ collection: null });

    expect(
      screen.getByText("You don't have access to this collection"),
    ).toBeInTheDocument();
  });
});
