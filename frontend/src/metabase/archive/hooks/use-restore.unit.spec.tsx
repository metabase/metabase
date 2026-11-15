import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
  createMockDocument,
} from "metabase-types/api/mocks";

import { type RestorableItem, useRestore } from "./use-restore";

function TestComponent({ item }: { item: RestorableItem }) {
  const restore = useRestore();
  return (
    <div>
      <button onClick={() => restore(item)}>Restore</button>
      <UndoListing />
    </div>
  );
}

const setup = (item: RestorableItem) => {
  renderWithProviders(<TestComponent item={item} />);
};

const clickRestore = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Restore" }));
};

const expectPutWithArchivedFalse = async (urlSubstring: string) => {
  const puts = await findRequests("PUT");
  expect(puts).toHaveLength(1);
  expect(puts[0].url).toContain(urlSubstring);
  expect(puts[0].body).toMatchObject({ archived: false });
};

describe("useRestore", () => {
  it.each(["card", "dataset", "metric"] as const)(
    "restores a %s via PUT /api/card/:id with archived: false",
    async (model) => {
      fetchMock.put(
        "path:/api/card/1",
        createMockCard({ id: 1, name: "My card", archived: false }),
      );

      setup({ model, id: 1, name: "My card", can_restore: true });
      await clickRestore();

      await expectPutWithArchivedFalse("/api/card/1");
      expect(
        await screen.findByText("My card has been restored."),
      ).toBeInTheDocument();
      expect(screen.getByText("View")).toBeInTheDocument();
    },
  );

  it("restores a dashboard via PUT /api/dashboard/:id with archived: false", async () => {
    fetchMock.put(
      "path:/api/dashboard/2",
      createMockDashboard({ id: 2, name: "My dash", archived: false }),
    );

    setup({ model: "dashboard", id: 2, name: "My dash", can_restore: true });
    await clickRestore();

    await expectPutWithArchivedFalse("/api/dashboard/2");
    expect(
      await screen.findByText("My dash has been restored."),
    ).toBeInTheDocument();
  });

  it("restores a collection via PUT /api/collection/:id with archived: false", async () => {
    fetchMock.put(
      "path:/api/collection/3",
      createMockCollection({ id: 3, name: "My folder", archived: false }),
    );

    setup({ model: "collection", id: 3, name: "My folder", can_restore: true });
    await clickRestore();

    await expectPutWithArchivedFalse("/api/collection/3");
    expect(
      await screen.findByText("My folder has been restored."),
    ).toBeInTheDocument();
  });

  it("restores a document via PUT /api/document/:id with archived: false", async () => {
    fetchMock.put(
      "path:/api/document/4",
      createMockDocument({ id: 4, name: "My doc", archived: false }),
    );

    setup({ model: "document", id: 4, name: "My doc", can_restore: true });
    await clickRestore();

    await expectPutWithArchivedFalse("/api/document/4");
    expect(
      await screen.findByText("My doc has been restored."),
    ).toBeInTheDocument();
  });

  it("falls back to the entity name when the item has no name", async () => {
    fetchMock.put(
      "path:/api/document/5",
      createMockDocument({ id: 5, name: "Server name", archived: false }),
    );

    setup({ model: "document", id: 5, can_restore: true });
    await clickRestore();

    expect(
      await screen.findByText("Server name has been restored."),
    ).toBeInTheDocument();
  });
});
