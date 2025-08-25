import type { Editor, Range } from "@tiptap/core";
import { forwardRef, useCallback, useImperativeHandle } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";
import type { SearchResult } from "metabase-types/api";

import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "../../shared/SuggestionPaper";
import { EntitySearchSection } from "../shared/EntitySearchSection";
import { useEntitySuggestions } from "../shared/useEntitySuggestions";

import type { MentionCommandProps } from "./MentionExtension";

interface MentionSuggestionProps {
  items: SearchResult[];
  command: (item: MentionCommandProps) => void;
  editor: Editor;
  range: Range;
  query: string;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionSuggestionComponent = forwardRef<
  SuggestionRef,
  MentionSuggestionProps
>(function MentionSuggestionComponent(
  { items: _items, command, editor, range: _range, query },
  ref,
) {
  const document = useSelector(getCurrentDocument);
  const onSelectEntity = useCallback(
    (item: { id: number | string; model: string }) => {
      command({
        id: item.id,
        model: item.model,
        document,
      });
    },
    [command, document],
  );

  const {
    menuItems,
    isLoading,
    searchResults,
    selectedIndex,
    modal,
    handlers,
  } = useEntitySuggestions({
    query,
    editor,
    onSelectEntity,
  });

  useImperativeHandle(ref, () => ({
    onKeyDown: handlers.onKeyDown,
  }));

  if (isLoading) {
    return <LoadingSuggestionPaper aria-label={t`Mention Dialog`} />;
  }

  return (
    <SuggestionPaper aria-label={t`Mention Dialog`}>
      <EntitySearchSection
        menuItems={menuItems}
        selectedIndex={selectedIndex}
        onItemSelect={handlers.selectItem}
        onFooterClick={handlers.openModal}
        query={query}
        searchResults={searchResults}
        modal={modal}
        onModalSelect={handlers.handleModalSelect}
        onModalClose={handlers.handleModalClose}
      />
    </SuggestionPaper>
  );
});

export const MentionSuggestion = MentionSuggestionComponent;
