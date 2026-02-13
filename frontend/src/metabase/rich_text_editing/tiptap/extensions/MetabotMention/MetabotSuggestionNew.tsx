import { useClickOutside } from "@mantine/hooks";
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  EntityPickerModal,
  MiniPicker,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { shouldDisableItemNotInDb } from "metabase/common/components/Pickers/DataPicker";
import type {
  MiniPickerItem,
  MiniPickerPickableItem,
} from "metabase/common/components/Pickers/MiniPicker/types";
import type { DatabaseId } from "metabase-types/api";

import { ExternalMenuTarget } from "../shared/ExternalMenuTarget";
import type { SuggestionModel } from "../shared/types";
import type { EntitySearchOptions } from "../shared/useEntitySearch";
import type {
  BareSuggestionRendererProps,
  BareSuggestionRendererRef,
} from "../suggestionRenderer";

import type { MentionProps } from "./MetabotMentionExtension";

interface MetabotMentionSuggestionPropsBase {
  searchModels?: SuggestionModel[];
  searchOptions?: EntitySearchOptions;
  onlyDatabaseId?: DatabaseId;
}
export type MetabotMentionSuggestionProps = MetabotMentionSuggestionPropsBase &
  BareSuggestionRendererProps<unknown, MentionProps>;

const MetabotMentionSuggestionComponent = forwardRef<
  BareSuggestionRendererRef,
  MetabotMentionSuggestionProps
>(function MentionSuggestionComponent(
  {
    items: _items,
    command,
    editor,
    range: _range,
    query,
    searchModels,
    onlyDatabaseId,
    decorationNode,
    onClose,
  },
  ref,
) {
  const [isBrowsing, setIsBrowsing] = useState(false);

  const onSelectEntity = useCallback(
    (item: OmniPickerItem) => {
      command({
        id: item.id,
        model: item.model,
        label: item.name,
      });
    },
    [command],
  );

  const closeOnClickOutside = !isBrowsing;
  const [menuDropdownDom, setMenuDropdownDom] = useState<HTMLDivElement | null>(
    null,
  );
  const menuDropdownRef = useCallback((node: HTMLDivElement | null) => {
    setMenuDropdownDom(node);
  }, []);

  const { onKeyDown, onFocus } = useFakeKeyboardHandler(menuDropdownDom);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (onKeyDown(event)) {
        return true;
      }

      if (event.key === "Escape") {
        onClose();
        return true;
      }
      return false;
    },
  }));

  const searchModelsReal = searchModels?.filter(
    (model) =>
      model !== "database" &&
      model !== "action" &&
      model !== "segment" &&
      model !== "user",
  );

  const shouldHide = useMemo(() => {
    const shouldDisableBasedOnDb = shouldDisableItemNotInDb(onlyDatabaseId);

    return (item: MiniPickerItem | unknown): item is MiniPickerPickableItem => {
      // @ts-expect-error - will fix when we align types with minipicker: UXW-2735
      const dbId = item?.db_id ?? item?.database_id ?? item?.dbId ?? undefined;

      return Boolean(
        // @ts-expect-error - Will be fixed once we align types with minipicker: UXW-2735
        shouldDisableBasedOnDb({ ...item, database_id: dbId }),
      );
    };
  }, [onlyDatabaseId]);

  // Because `Menu.Target` is set to just the mention decoration node,
  // we need to have a custom "outside" definition to not close when clicking inside the editor.
  useClickOutside(
    () => {
      if (closeOnClickOutside) {
        onClose();
      }
    },
    ["mousedown", "touchstart"],
    [editor.view.dom, menuDropdownDom],
  );

  return (
    <>
      <MiniPicker
        opened
        searchQuery={query}
        shouldShowLibrary
        models={searchModelsReal ?? []}
        closeOnClickOutside={false}
        onChange={onSelectEntity}
        onClose={onClose}
        shouldHide={shouldHide}
        onBrowseAll={() => {
          setIsBrowsing(true);
        }}
        menuDropdownRef={menuDropdownRef}
        menuDropdownProps={{
          onFocus,
        }}
      >
        <ExternalMenuTarget element={decorationNode} />
      </MiniPicker>
      {isBrowsing && (
        <EntityPickerModal
          title={t`Mention an item`}
          value={
            onlyDatabaseId
              ? {
                  model: "database",
                  id: onlyDatabaseId,
                }
              : undefined
          }
          models={searchModelsReal ?? []}
          options={{
            hasDatabases: true,
            hasRootCollection: true,
            hasPersonalCollections: true,
            hasSearch: true,
            hasRecents: true,
            hasLibrary: true,
            hasConfirmButtons: false,
            canCreateCollections: false,
            canCreateDashboards: false,
          }}
          onChange={(item) => {
            onSelectEntity(item);
            onClose();
          }}
          onClose={() => {
            setIsBrowsing(false);
          }}
          isDisabledItem={shouldDisableItemNotInDb(onlyDatabaseId)}
          searchParams={
            onlyDatabaseId !== undefined
              ? {
                  table_db_id: onlyDatabaseId,
                }
              : undefined
          }
          searchQuery={query}
        />
      )}
    </>
  );
});

// In case of mentions, we want to have the editor focused while allowing navigation
// inside the menu. We can't have two elements focused at the same time, so we fake
// selections inside the menu.
function useFakeKeyboardHandler(menuDropdownDom: Element | null) {
  const getAllMenuItems = useCallback(() => {
    if (!menuDropdownDom) {
      throw Error("Menu element is not mounted.");
    }

    const items = Array.from(
      menuDropdownDom.querySelectorAll('[role="menuitem"]'),
    );

    const selectedIndex = items.findIndex(
      (item) => item.getAttribute("aria-selected") === "true",
    );

    if (selectedIndex === -1) {
      return {
        selectedItem: null,
        selectedIndex: null,
        items,
      };
    }

    return {
      selectedItem: items[selectedIndex],
      selectedIndex: selectedIndex,
      items,
    };
  }, [menuDropdownDom]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!menuDropdownDom) {
        return false;
      }

      return match(event.key)
        .returnType<boolean>()
        .with("Home", "End", (key) => {
          const { items, selectedItem } = getAllMenuItems();

          if (selectedItem !== null) {
            selectedItem.setAttribute("aria-selected", "false");
          }

          const nextIndex = key === "Home" ? 0 : items.length - 1;
          const nextItem = items[nextIndex];
          if (nextItem) {
            nextItem.setAttribute("aria-selected", "true");
            nextItem.scrollIntoView({ block: "nearest" });
          }
          return true;
        })
        .with("ArrowUp", "ArrowDown", (key) => {
          const { items, selectedIndex, selectedItem } = getAllMenuItems();

          if (selectedItem === null) {
            items.at(0)?.setAttribute("aria-selected", "true");
            return true;
          }

          let nextIndex =
            key === "ArrowUp" ? selectedIndex - 1 : selectedIndex + 1;

          if (nextIndex > items.length - 1) {
            nextIndex = 0;
          }
          if (nextIndex < 0) {
            nextIndex = items.length - 1;
          }

          const nextItem = items.at(nextIndex);
          if (nextItem) {
            selectedItem.removeAttribute("aria-selected");
            nextItem.setAttribute("aria-selected", "true");
            nextItem.scrollIntoView({ block: "nearest" });
          }
          return true;
        })
        .with("Enter", () => {
          const { selectedItem } = getAllMenuItems();
          if (selectedItem === null) {
            return false;
          }

          if (selectedItem instanceof HTMLElement) {
            selectedItem.click();
          }
          return true;
        })
        .otherwise(() => false);
    },
    [getAllMenuItems, menuDropdownDom],
  );

  // If the user explicitly focused in the menu, we want to switch to the default handlers instead of fake ones.
  const onFocus = useCallback(() => {
    if (!menuDropdownDom) {
      return;
    }

    const { selectedItem } = getAllMenuItems();
    if (selectedItem === null) {
      return;
    }
    selectedItem.removeAttribute("aria-selected");
  }, [getAllMenuItems, menuDropdownDom]);

  return {
    onKeyDown,
    onFocus,
  };
}

export const MetabotMentionSuggestionNew = MetabotMentionSuggestionComponent;

export const createMetabotMentionSuggestionNew = (
  outerProps: MetabotMentionSuggestionPropsBase,
) => {
  return forwardRef<BareSuggestionRendererRef, MetabotMentionSuggestionProps>(
    function MentionSuggestionWrapper(props, ref) {
      return (
        <MetabotMentionSuggestionNew {...props} ref={ref} {...outerProps} />
      );
    },
  );
};
