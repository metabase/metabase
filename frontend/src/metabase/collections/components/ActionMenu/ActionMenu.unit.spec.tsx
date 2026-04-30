import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, queryIcon, renderWithProviders } from "__support__/ui";
import { Collections } from "metabase/entities/collections";
import { Dashboards } from "metabase/entities/dashboards";
import { Questions } from "metabase/entities/questions";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import type {
  Collection,
  CollectionItem,
  CollectionItemModel,
  Database,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import ActionMenu, { getParentEntityLink } from "./ActionMenu";

interface SetupOpts {
  item: CollectionItem;
  collection?: Collection;
  databases?: Database[];
  isXrayEnabled?: boolean;
}

const setup = ({
  item,
  collection = createMockCollection({ can_write: true }),
  databases = [],
  isXrayEnabled = false,
}: SetupOpts) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases,
    }),
    settings: createMockSettingsState({
      "enable-xrays": isXrayEnabled,
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const onCopy = jest.fn();
  const onMove = jest.fn();

  renderWithProviders(
    <ActionMenu
      item={item}
      collection={collection}
      databases={metadata.databasesList()}
      onCopy={onCopy}
      onMove={onMove}
    />,
    { storeInitialState },
  );

  return { onCopy, onMove };
};

describe("ActionMenu", () => {
  describe("preview", () => {
    it.each<CollectionItemModel>(["card", "metric"])(
      "should show an option to hide preview for a pinned %s",
      async (model) => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: true,
        });
        setupCardEndpoints(createMockCard({ id: item.id }));

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(
          await screen.findByText("Don’t show visualization"),
        );

        await waitFor(() =>
          expect(
            fetchMock.callHistory.calls(`path:/api/card/${item.id}`, {
              method: "PUT",
            }),
          ).toHaveLength(1),
        );
        const call = fetchMock.callHistory.lastCall(
          `path:/api/card/${item.id}`,
          { method: "PUT" },
        );
        expect(JSON.parse(call?.options.body as string)).toEqual({
          collection_preview: false,
        });
      },
    );

    it.each<CollectionItemModel>(["card", "metric"])(
      "should show an option to show preview for a pinned %s",
      async (model) => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: false,
        });
        setupCardEndpoints(createMockCard({ id: item.id }));

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(await screen.findByText("Show visualization"));

        await waitFor(() =>
          expect(
            fetchMock.callHistory.calls(`path:/api/card/${item.id}`, {
              method: "PUT",
            }),
          ).toHaveLength(1),
        );
        const call = fetchMock.callHistory.lastCall(
          `path:/api/card/${item.id}`,
          { method: "PUT" },
        );
        expect(JSON.parse(call?.options.body as string)).toEqual({
          collection_preview: true,
        });
      },
    );

    it("should not show an option to hide preview for a pinned model", async () => {
      setup({
        item: createMockCollectionItem({
          model: "dataset",
          collection_position: 1,
        }),
      });

      await userEvent.click(getIcon("ellipsis"));

      expect(
        screen.queryByText("Don’t show visualization"),
      ).not.toBeInTheDocument();
    });
  });

  describe("moving and archiving", () => {
    it("should allow to move and archive regular collections", async () => {
      const item = createMockCollectionItem({
        id: 1,
        name: "Collection",
        model: "collection",
        can_write: true,
        setCollection: jest.fn(),
      });
      fetchMock.put("path:/api/collection/1", { ...item, archived: true });

      const { onMove } = setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move"));
      expect(onMove).toHaveBeenCalledWith([item]);

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move to trash"));

      const calls = fetchMock.callHistory.calls("path:/api/collection/1");
      expect(calls).toHaveLength(1);
      const [putCall] = calls;
      expect(putCall.options.method).toBe("PUT");
      expect(JSON.parse(putCall.options.body as string)).toMatchObject({
        archived: true,
      });
    });

    it("should not allow to move and archive personal collections", async () => {
      const item = createMockCollectionItem({
        name: "My personal collection",
        model: "collection",
        can_write: true,
        personal_owner_id: 1,
        setCollection: jest.fn(),
        copy: true,
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    it("should not allow to move and archive read only collections", async () => {
      const item = createMockCollectionItem({
        name: "My Read Only collection",
        model: "collection",
        can_write: false,
        setCollection: jest.fn(),
        copy: true,
      });

      setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
    });

    describe("getParentEntityLink", () => {
      it("should generate collection link for collection question", () => {
        const updatedCollection = Collections.wrapEntity(
          createMockCollectionItem({ archived: false }),
        );
        const link = getParentEntityLink(updatedCollection, undefined);
        expect(link).toBe("/collection/root");
      });

      it("should generate collection link for dashboards", () => {
        const updatedDashboard = Dashboards.wrapEntity(
          createMockDashboard({ archived: false }),
        );
        const parentCollection = Collections.wrapEntity(
          createMockCollectionItem({ id: 123 }),
        );
        const link = getParentEntityLink(updatedDashboard, parentCollection);
        expect(link).toBe("/collection/123-question");
      });

      it("should generate collection link for normal question", () => {
        const updatedQuestion = Questions.wrapEntity(
          createMockCard({ archived: false }),
        );
        const link = getParentEntityLink(updatedQuestion, undefined);
        expect(link).toBe("/collection/root");
      });

      it("should generate collection link for dashboard question", () => {
        const updatedQuestion = Questions.wrapEntity(
          createMockCard({ archived: false, dashboard_id: 123 }),
        );
        const link = getParentEntityLink(updatedQuestion, undefined);
        expect(link).toBe("/dashboard/123");
      });
    });
  });

  describe("x-rays", () => {
    it("should allow to x-ray a model when xrays are enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(await screen.findByText("X-ray this")).toBeInTheDocument();
    });

    it("should not allow to x-ray a model when xrays are not enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dataset",
      });

      setup({ item, isXrayEnabled: false });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray a question when xrays are enabled", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "card",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });

    it("should not allow to x-ray non-models", async () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "dashboard",
      });

      setup({ item, isXrayEnabled: true });

      await userEvent.click(getIcon("ellipsis"));
      expect(screen.queryByText("X-ray this")).not.toBeInTheDocument();
    });
  });

  describe("tables", () => {
    it("should not allow actions on a table", () => {
      const item = createMockCollectionItem({
        id: 1,
        model: "table",
      });

      setup({ item });

      expect(queryIcon("ellipsis")).not.toBeInTheDocument();
    });
  });
});
