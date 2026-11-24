import { EditorContent } from "@tiptap/react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { ActionIcon, Flex, Icon, Text } from "metabase/ui";

import type { FilterBarProps } from "../../types";

import S from "./FilterBar.module.css";
import { useFilterBarEditor } from "./use-filter-bar-editor";

export const FilterBar = <F,>(props: FilterBarProps<F>) => {
  const { editor, error, hasFilters, clear } = useFilterBarEditor(props);

  return (
    <Flex
      align="center"
      gap="sm"
      mih="3rem"
      pr="xxl"
      bg="background_page-secondary"
    >
      <EditorContent className={S.editor} editor={editor} />
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
