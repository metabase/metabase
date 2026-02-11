import { getIcon } from "metabase/lib/icon";
import type { CollectionItemModel } from "metabase-types/api";

import {
  type EntityPickerProps,
  type OmniPickerCollectionItem,
  OmniPickerFolderModel,
  type OmniPickerItem,
} from "./types";
import {
  getCollectionType,
  getEntityPickerIcon,
  getItemFunctions,
  getNamespacesFromModels,
  getValidCollectionItemModels,
  isSelectedItem,
} from "./utils";

jest.mock("metabase/lib/icon", () => ({
  getIcon: jest.fn(),
}));

describe("EntityPicker utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getEntityPickerIcon", () => {
    it("should return the icon from getIcon", () => {
      (getIcon as jest.Mock).mockReturnValue({
        name: "table",
        color: "text-dark",
      });
      const item = { id: 1, model: "table" } as OmniPickerItem;
      const result = getEntityPickerIcon(item);
      expect(result).toEqual({
        name: "table",
        c: "text-dark",
        color: undefined,
      });
      expect(getIcon).toHaveBeenCalledWith(item, { isTenantUser: undefined });
    });

    it("should set color to text-primary-inverse if selected and no color present", () => {
      (getIcon as jest.Mock).mockReturnValue({ name: "table" });
      const item = { id: 1, model: "table" } as OmniPickerItem;
      const result = getEntityPickerIcon(item, { isSelected: true });
      expect(result).toEqual({
        name: "table",
        c: "text-primary-inverse",
        color: undefined,
      });
    });

    it("should change folder icon to folder_filled if selected", () => {
      (getIcon as jest.Mock).mockReturnValue({
        name: "folder",
        color: "text-yellow",
      });
      const item = { id: 1, model: "collection" } as OmniPickerItem;
      const result = getEntityPickerIcon(item, { isSelected: true });
      expect(result).toEqual({
        name: "folder_filled",
        c: "text-yellow",
        color: undefined,
      });
    });
  });

  describe("isSelectedItem", () => {
    it("should return true if items match id and model", () => {
      const item1 = { id: 1, model: "table" } as OmniPickerItem;
      const item2 = { id: 1, model: "table" } as OmniPickerItem;
      expect(isSelectedItem(item1, item2)).toBe(true);
    });

    it("should return false if items have different id", () => {
      const item1 = { id: 1, model: "table" } as OmniPickerItem;
      const item2 = { id: 2, model: "table" } as OmniPickerItem;
      expect(isSelectedItem(item1, item2)).toBe(false);
    });

    it("should return false if items have different model", () => {
      const item1 = { id: 1, model: "table" } as OmniPickerItem;
      const item2 = { id: 1, model: "database" } as OmniPickerItem;
      expect(isSelectedItem(item1, item2)).toBe(false);
    });

    it("should return false if selectedItem is null", () => {
      const item1 = { id: 1, model: "table" } as OmniPickerItem;
      expect(isSelectedItem(item1, null)).toBe(false);
    });

    it("should check namespace if present", () => {
      const item1 = {
        id: 1,
        model: "collection",
        namespace: "snippets",
      } as OmniPickerItem;
      const item2 = {
        id: 1,
        model: "collection",
        namespace: "snippets",
      } as OmniPickerItem;
      const item3 = {
        id: 1,
        model: "collection",
        namespace: undefined,
      } as OmniPickerItem;

      expect(isSelectedItem(item1, item2)).toBe(true);
      expect(isSelectedItem(item1, item3)).toBe(false);
    });
  });

  describe("getItemFunctions", () => {
    const models = ["table", "card"] as EntityPickerProps["models"];

    describe("isFolderItem", () => {
      it("should return true for Database and Schema models", () => {
        const { isFolderItem } = getItemFunctions({ models });
        expect(
          isFolderItem({
            id: 1,
            model: OmniPickerFolderModel.Database,
          } as OmniPickerItem),
        ).toBe(true);
        expect(
          isFolderItem({
            id: 1,
            model: OmniPickerFolderModel.Schema,
          } as unknown as OmniPickerItem),
        ).toBe(true);
      });

      it("should return false for invalid items", () => {
        const { isFolderItem } = getItemFunctions({ models });
        expect(isFolderItem(null as any)).toBe(false);
        expect(isFolderItem({} as any)).toBe(false);
      });

      it("should use custom isFolderItem if provided", () => {
        const customIsFolderItem = jest.fn().mockReturnValue(true);
        const { isFolderItem } = getItemFunctions({
          models,
          isFolderItem: customIsFolderItem as any,
        });

        const cardItem = { id: 1, model: "card" } as OmniPickerItem;
        const dbItem = {
          id: 1,
          model: OmniPickerFolderModel.Database,
        } as OmniPickerItem;

        // base behavior doesn't expand with permissive custom function
        expect(isFolderItem(cardItem)).toBe(false);
        expect(isFolderItem(dbItem)).toBe(true);

        // If custom returns false, it should narrow (become false)
        customIsFolderItem.mockReturnValue(false);
        expect(isFolderItem(cardItem)).toBe(false);
        expect(isFolderItem(dbItem)).toBe(false);
      });

      it("should return true for Collection if it contains allowed models", () => {
        const { isFolderItem } = getItemFunctions({ models: ["card"] });
        const item = {
          id: 1,
          model: OmniPickerFolderModel.Collection,
          here: ["card"],
        } as any;
        expect(isFolderItem(item)).toBe(true);
      });

      it("should return false for Collection if it does not contain allowed models", () => {
        const { isFolderItem } = getItemFunctions({ models: ["card"] });
        const item = {
          id: 1,
          model: OmniPickerFolderModel.Collection,
          here: ["dataset"],
        } as any;
        expect(isFolderItem(item)).toBe(false);
      });

      it("should return false for Collection if it has neither 'here' nor 'below'", () => {
        const { isFolderItem } = getItemFunctions({ models: ["card"] });
        const item = {
          id: 1,
          model: OmniPickerFolderModel.Collection,
        } as any;
        expect(isFolderItem(item)).toBe(false);
      });
    });

    describe("isSelectableItem", () => {
      it("should return true if model is in allowed models", () => {
        const { isSelectableItem } = getItemFunctions({ models: ["table"] });
        expect(
          isSelectableItem({ id: 1, model: "table" } as OmniPickerItem),
        ).toBe(true);
      });

      it("should return false for invalid items", () => {
        const { isSelectableItem } = getItemFunctions({ models: ["table"] });
        // @ts-expect-error - testing invalid item
        expect(isSelectableItem({ idx: 444 })).toBe(false);
      });

      it("should return false if model is not in allowed models", () => {
        const { isSelectableItem } = getItemFunctions({ models: ["table"] });
        expect(
          isSelectableItem({ id: 1, model: "card" } as OmniPickerItem),
        ).toBe(false);
      });

      it("should use custom isSelectableItem if provided", () => {
        const customIsSelectableItem = jest.fn().mockReturnValue(true);
        const { isSelectableItem } = getItemFunctions({
          models: ["table"],
          isSelectableItem: customIsSelectableItem,
        });

        const dashboardItem = { id: 1, model: "dashboard" } as OmniPickerItem;
        const tableItem = { id: 1, model: "table" } as OmniPickerItem;

        // When the function is permissive, base behavior applies
        expect(isSelectableItem(dashboardItem)).toBe(false);
        expect(isSelectableItem(tableItem)).toBe(true);

        // If custom returns false, it should narrow, not expand
        customIsSelectableItem.mockReturnValue(false);
        expect(isSelectableItem(dashboardItem)).toBe(false);
        expect(isSelectableItem(tableItem)).toBe(false);
      });
    });

    describe("isHiddenItem", () => {
      it("should return true for invalid items", () => {
        const { isHiddenItem } = getItemFunctions({ models: [] });
        expect(isHiddenItem(null as any)).toBe(true);
      });

      it("should use custom isHiddenItem if provided", () => {
        const customIsHiddenItem = jest.fn().mockReturnValue(false);
        const { isHiddenItem } = getItemFunctions({
          models: ["table"],
          isHiddenItem: customIsHiddenItem,
        });

        const tableItem = { id: 1, model: "table" } as OmniPickerItem;
        const cardItem = { id: 1, model: "card" } as OmniPickerItem;

        // base behavior not modified by permissive custom function
        expect(isHiddenItem(tableItem)).toBe(false);
        expect(isHiddenItem(cardItem)).toBe(true);

        // If custom returns true, it narrow what is shown
        customIsHiddenItem.mockReturnValue(true);
        expect(isHiddenItem(tableItem)).toBe(true);
        expect(isHiddenItem(cardItem)).toBe(true);
      });

      it("should return true if item is neither selectable nor a folder", () => {
        const { isHiddenItem } = getItemFunctions({ models: ["table"] });
        // "card" is not in models, and not a folder model
        const item = { id: 1, model: "card" } as OmniPickerItem;
        expect(isHiddenItem(item)).toBe(true);
      });

      it("should return false if item is selectable", () => {
        const { isHiddenItem } = getItemFunctions({ models: ["table"] });
        const item = { id: 1, model: "table" } as OmniPickerItem;
        expect(isHiddenItem(item)).toBe(false);
      });

      it("should return false if item is a folder", () => {
        const { isHiddenItem } = getItemFunctions({ models: ["table"] });
        const item = {
          id: 1,
          model: OmniPickerFolderModel.Database,
        } as OmniPickerItem;
        expect(isHiddenItem(item)).toBe(false);
      });
    });

    describe("isDisabledItem", () => {
      it("should return true for invalid items", () => {
        const { isDisabledItem } = getItemFunctions({ models: [] });
        // @ts-expect-error: testing invalid item
        expect(isDisabledItem({ idx: 123, modelx: "foo" })).toBe(true);
      });

      it("should return false for valid items", () => {
        const { isDisabledItem } = getItemFunctions({ models: [] });
        const item = { id: 1, model: "card" } as OmniPickerItem;
        expect(isDisabledItem(item)).toBe(false);
      });

      it("should use custom isDisabledItem if provided", () => {
        const customIsDisabledItem = jest.fn().mockReturnValue(false);

        const { isDisabledItem } = getItemFunctions({
          models: ["card"],
          isDisabledItem: customIsDisabledItem,
        });

        // @ts-expect-error: testing invalid item
        const invalidItem = { idx: 1, model: "dashboard" } as OmniPickerItem;
        const validItem = { id: 1, model: "card" } as OmniPickerItem;

        // doesn't validate invalid item
        expect(isDisabledItem(invalidItem)).toBe(true);
        expect(isDisabledItem(validItem)).toBe(false);

        // change mock to return true
        customIsDisabledItem.mockReturnValue(true);

        // still rejects invalid item
        expect(isDisabledItem(invalidItem)).toBe(true);

        // now valid item is also disabled
        expect(isDisabledItem(validItem)).toBe(true);
      });
    });
  });

  describe("getValidCollectionItemModels", () => {
    it("should filter valid collection models and append 'collection'", () => {
      const input = [
        "card",
        "dashboard",
        "pikachu",
        "table",
        "transform",
        "snippet",
        "",
      ];
      const result = getValidCollectionItemModels(
        input as CollectionItemModel[],
      );
      expect(result).toEqual([
        "card",
        "dashboard",
        "table",
        "transform",
        "snippet",
        "collection",
      ]);
    });
  });

  describe("getCollectionType", () => {
    const baseCollection: OmniPickerCollectionItem = {
      id: 111,
      model: "collection",
      name: "Test Collection",
    };

    it("should return type if present", () => {
      const item: OmniPickerCollectionItem = {
        ...baseCollection,
        type: "trash",
      };
      expect(getCollectionType(item)).toBe("trash");
    });

    it("should return null if not present", () => {
      const item = {} as any;
      expect(getCollectionType(item)).toBeNull();
    });
  });

  describe("getNamespacesFromModels", () => {
    it("should return snippet namespace if snippet model is present", () => {
      expect(getNamespacesFromModels(["snippet"])).toContain("snippets");
    });

    it("should return transform namespace if transform model is present", () => {
      expect(getNamespacesFromModels(["transform"])).toContain("transforms");
    });

    it("should return normal namespaces for other models", () => {
      const namespaces = getNamespacesFromModels(["card"]);
      expect(namespaces).toContain(null);
      expect(namespaces).toContain("analytics");
    });

    it("should combine namespaces", () => {
      const namespaces = getNamespacesFromModels(["snippet", "card"]);
      expect(namespaces).toContain("snippets");
      expect(namespaces).toContain(null);
    });

    it("should combine all namespaces", () => {
      const namespaces = getNamespacesFromModels([
        "snippet",
        "transform",
        "card",
      ]);
      expect(namespaces).toEqual([
        "snippets",
        "transforms",
        null,
        "analytics",
        "shared-tenant-collection",
        "tenant-specific",
      ]);
    });
  });
});
