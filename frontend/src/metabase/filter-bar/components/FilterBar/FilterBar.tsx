import { EditorContent } from "@tiptap/react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ActionIcon, Flex, Icon, Text } from "metabase/ui";

import type { FilterBarProps } from "../../types";
import { FilterPopover } from "../FilterPopover/FilterPopover";

import S from "./FilterBar.module.css";
import { FilterBarContext } from "./FilterBarContext";
import { useFilterBarEditor } from "./use-filter-bar-editor";

export const FilterBar = <F,>(props: FilterBarProps<F>) => {
  const {
    editor,
    error,
    hasFilters,
    clear,
    suggestion,
    listKeysRef,
    getFilterEditorRect,
    dismissPopover,
    filterEditor,
    context,
  } = useFilterBarEditor(props);
  const { adapter } = props;

  return (
    <Flex align="center" gap="sm" pr="xxl" bg="background_page-secondary">
      <FilterBarContext.Provider value={context}>
        <EditorContent className={S.editor} editor={editor} />
      </FilterBarContext.Provider>
      {error && (
        <Text size="sm" c="feedback-negative" lh={1}>
          {match(error.code)
            .with("missing-operand", () => t`Expected a filter`)
            .with("empty-parentheses", () => t`Empty parentheses`)
            .with(
              "missing-closing-parenthesis",
              () => t`Missing closing parenthesis`,
            )
            .with(
              "unexpected-closing-parenthesis",
              () => t`Unexpected closing parenthesis`,
            )
            .exhaustive()}
        </Text>
      )}
      <FilterPopover
        adapter={adapter}
        suggestion={suggestion}
        filterEditor={filterEditor}
        getFilterEditorRect={getFilterEditorRect}
        listKeys={listKeysRef}
        onDismiss={dismissPopover}
      />
      {hasFilters && (
        <ActionIcon
          my="-xxs"
          size="md"
          variant="subtle"
          aria-label={t`Clear all filters`}
          onClick={clear}
        >
          <Icon name="trash" />
        </ActionIcon>
      )}
    </Flex>
  );
};
