import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders } from "__support__/ui";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import Questions from "metabase/entities/questions";
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
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

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
      async model => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: true,
          setCollectionPreview: jest.fn(),
        });

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(
          await screen.findByText("Don’t show visualization"),
        );

        expect(item.setCollectionPreview).toHaveBeenCalledWith(false);
      },
    );

    it.each<CollectionItemModel>(["card", "metric"])(
      "should show an option to show preview for a pinned %s",
      async model => {
        const item = createMockCollectionItem({
          model,
          collection_position: 1,
          collection_preview: false,
          setCollectionPreview: jest.fn(),
        });

        setup({ item });

        await userEvent.click(getIcon("ellipsis"));
        await userEvent.click(await screen.findByText("Show visualization"));

        expect(item.setCollectionPreview).toHaveBeenCalledWith(true);
      },
    );

    it("should not show an option to hide preview for a pinned model", async () => {
      setup({
        item: createMockCollectionItem({
          model: "dataset",
          collection_position: 1,
          setCollectionPreview: jest.fn(),
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
        name: "Collection",
        model: "collection",
        can_write: true,
        setCollection: jest.fn(),
        setArchived: jest.fn(() => Promise.resolve()),
      });

      const { onMove } = setup({ item });

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move"));
      expect(onMove).toHaveBeenCalledWith([item]);

      await userEvent.click(getIcon("ellipsis"));
      await userEvent.click(await screen.findByText("Move to trash"));
      expect(item.setArchived).toHaveBeenCalledWith(true);
    });

    it("should not allow to move and archive personal collections", async () => {
      const item = createMockCollectionItem({
        name: "My personal collection",
        model: "collection",
        can_write: true,
        personal_owner_id: 1,
        setCollection: jest.fn(),
        setArchived: jest.fn(() => Promise.resolve()),
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
        setArchived: jest.fn(() => Promise.resolve()),
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
});
