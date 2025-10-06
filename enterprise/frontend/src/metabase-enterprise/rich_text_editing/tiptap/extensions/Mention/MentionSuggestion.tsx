import type { Editor, Range } from "@tiptap/core";
import { forwardRef, useCallback, useImperativeHandle } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "metabase-enterprise/documents/components/Editor/shared/SuggestionPaper";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";
import type { SearchResult } from "metabase-types/api";

import { EntitySearchSection } from "../shared/EntitySearchSection";
import type { SuggestionModel } from "../shared/types";
import { useEntitySuggestions } from "../shared/useEntitySuggestions";

import type { MentionCommandProps } from "./MentionExtension";

export interface MentionSuggestionProps {
  items: SearchResult[];
  command: (item: MentionCommandProps) => void;
  editor: Editor;
  range: Range;
  query: string;
  searchModels?: SuggestionModel[];
  canBrowseAll?: boolean;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const MentionSuggestionComponent = forwardRef<
  SuggestionRef,
  MentionSuggestionProps
>(function MentionSuggestionComponent(
  {
    items: _items,
    command,
    editor,
    range,
    query,
    searchModels,
    canBrowseAll = true,
  },
  ref,
) {
  const document = useSelector(getCurrentDocument);
  const onSelectEntity = useCallback(
    (item: {
      id: number | string;
      model: string;
      label?: string;
      href?: string | null;
    }) => {
      command({
        id: item.id,
        model: item.model,
        label: item.label,
        href: item.href,
        document, // currently only used for analytics tracking purposes
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
    selectedSearchModelName,
    handlers,
  } = useEntitySuggestions({
    query,
    editor,
    range,
    searchModels,
    onSelectEntity,
    canBrowseAll,
  });

  useImperativeHandle(ref, () => ({
    onKeyDown: handlers.onKeyDown,
  }));

  if (isLoading) {
    return <LoadingSuggestionPaper aria-label={t`Mention Dialog`} />;
  }

  return (
    <SuggestionPaper
      aria-label={t`Mention Dialog`}
      key={selectedSearchModelName}
    >
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
        onItemHover={handlers.hoverHandler}
        selectedSearchModelName={selectedSearchModelName}
        canBrowseAll={canBrowseAll}
      />
    </SuggestionPaper>
  );
});

export const MentionSuggestion = MentionSuggestionComponent;

export const createMentionSuggestion = ({
  searchModels,
  canBrowseAll,
}: {
  searchModels: SuggestionModel[];
  canBrowseAll?: boolean;
}) => {
  return forwardRef<
    SuggestionRef,
    Omit<MentionSuggestionProps, "searchModels">
  >(function MentionSuggestionWrapper(props, ref) {
    return (
      <MentionSuggestion
        {...props}
        ref={ref}
        searchModels={searchModels}
        canBrowseAll={canBrowseAll}
      />
    );
  });
};
