import fetchMock from "fetch-mock";

import { renderWithProviders, screen } from "__support__/ui";
import type { RemoteSyncEntity } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
import { createMockRemoteSyncEntity } from "metabase-types/api/mocks/remote-sync";

import { AllChangesView } from "./AllChangesView";

const updatedEntity = createMockRemoteSyncEntity({
  collection_id: 1,
});
const removedEntity = createMockRemoteSyncEntity({
  id: 2,
  name: "Removed Question",
  sync_status: "removed",
  collection_id: 1,
});
const deletedEntity = createMockRemoteSyncEntity({
  id: 3,
  name: "Deleted Question",
  sync_status: "delete",
  collection_id: 1,
});

const setup = ({
  entities = [updatedEntity],
}: {
  entities: RemoteSyncEntity[];
}) => {
  const collections = [createMockCollection({ name: "Entity Collection" })];

  fetchMock.get("/api/collection/tree", collections);
  renderWithProviders(
    <AllChangesView entities={entities} collections={collections} />,
  );
};

describe("AllChangesView", () => {
  describe("warning message", () => {
    it("should show a warning when removing entities", () => {
      setup({ entities: [updatedEntity, removedEntity] });

      expect(screen.getByText(/that depend on the items/)).toBeInTheDocument();
    });

    it("should show a warning when deleting entities", () => {
      setup({ entities: [updatedEntity, deletedEntity] });

      expect(screen.getByText(/that depend on the items/)).toBeInTheDocument();
    });

    it("should not show a warning when no items have been removed or deleted", () => {
      setup({ entities: [updatedEntity] });

      expect(
        screen.queryByText(/that depend on the items/),
      ).not.toBeInTheDocument();
    });
  });
});
