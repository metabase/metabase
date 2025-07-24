import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useListRecentsQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import Search from "metabase/entities/search";
import { getName } from "metabase/lib/name";
import { useDispatch } from "metabase/lib/redux";
import { RecentsListContent } from "metabase/nav/components/search/RecentsList/RecentsListContent";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import {
  ResultNameSection,
  ResultTitle,
  SearchResultContainer,
} from "metabase/search/components/SearchResult";
import { IconWrapper } from "metabase/search/components/SearchResult/components/ItemIcon.styled";
import { Box, Group, Icon, Popover } from "metabase/ui";
import { useCreateReportSnapshotMutation } from "metabase-enterprise/api";
import type {
  RecentItem,
  SearchModel,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

import { fetchReportQuestionData } from "../../reports.slice";

const MODELS_TO_SEARCH: SearchModel[] = ["card", "dataset"];

interface SearchResultsFooterProps {
  isSelected?: boolean;
  onFooterSelect?: () => void;
}

const SearchResultsFooter = ({
  isSelected,
  onFooterSelect,
}: SearchResultsFooterProps) => (
  <Box mx="sm" mb="sm" mt={-8}>
    <SearchResultContainer
      align="center"
      isActive
      isSelected={isSelected}
      onClick={onFooterSelect}
    >
      <IconWrapper active archived={false} type="search">
        <Icon name="search" />
      </IconWrapper>

      <ResultNameSection justify="center" gap="xs">
        <Group gap="xs" align="center" wrap="nowrap">
          <ResultTitle
            role="heading"
            data-testid="search-result-item-name"
            truncate
          >
            {t`Browse all`}
          </ResultTitle>
        </Group>
      </ResultNameSection>
    </SearchResultContainer>
  </Box>
);

interface QuestionMentionPluginProps {
  editor: Editor;
}

export const QuestionMentionPlugin = ({
  editor,
}: QuestionMentionPluginProps) => {
  const dispatch = useDispatch();
  const [createSnapshot] = useCreateReportSnapshotMutation();
  const [showPopover, setShowPopover] = useState(false);
  const [modal, setModal] = useState<"question-picker" | null>(null);
  const [query, setQuery] = useState("");
  const [mentionRange, setMentionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);
  const [anchorPos, setAnchorPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const virtualRef = useRef<HTMLDivElement>(null);

  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, { refetchOnMountOrArgChange: true });

  const filteredRecents = recents
    .filter((item) => item.model === "card" || item.model === "dataset")
    .slice(0, 4);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateHandler = () => {
      const { $from } = editor.state.selection;
      const text = $from.nodeBefore?.text || "";

      // Check if we're typing after @
      if (text && text.endsWith("@")) {
        const from = $from.pos - 1;
        setMentionRange({ from, to: $from.pos });

        // Get cursor position
        const coords = editor.view.coordsAtPos(from);
        setAnchorPos({ x: coords.left, y: coords.bottom });

        setShowPopover(true);
        setQuery("");
      } else if (mentionRange && showPopover) {
        // Check if we're still in mention mode
        const currentText = editor.state.doc.textBetween(
          mentionRange.from,
          Math.min(editor.state.doc.content.size, $from.pos),
          "",
        );

        if (currentText.startsWith("@")) {
          setQuery(currentText.slice(1));
          setMentionRange({ from: mentionRange.from, to: $from.pos });
        } else {
          setShowPopover(false);
          setMentionRange(null);
        }
      }
    };

    const keydownHandler = (event: KeyboardEvent) => {
      if (!showPopover) {
        return;
      }

      // Prevent cursor movement in editor for arrow keys
      if (["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setShowPopover(false);
        setMentionRange(null);
        editor.commands.focus();
      }
    };

    editor.on("update", updateHandler);
    editor.on("selectionUpdate", updateHandler);

    const editorElement = editor.view.dom;
    editorElement.addEventListener("keydown", keydownHandler, true);

    return () => {
      editor.off("update", updateHandler);
      editor.off("selectionUpdate", updateHandler);
      editorElement.removeEventListener("keydown", keydownHandler, true);
    };
  }, [editor, mentionRange, showPopover]);

  const handleSelect = async (item: UnrestrictedLinkEntity) => {
    if (!mentionRange) {
      return;
    }

    const wrappedItem = Search.wrapEntity(item, dispatch);

    try {
      const snapshot = await createSnapshot({
        card_id: wrappedItem.id,
      }).unwrap();

      dispatch(
        fetchReportQuestionData({
          cardId: wrappedItem.id,
          snapshotId: snapshot.snapshot_id,
        }),
      );

      editor
        .chain()
        .focus()
        .deleteRange(mentionRange)
        .insertContent({
          type: "questionEmbed",
          attrs: {
            snapshotId: snapshot.snapshot_id,
            questionId: wrappedItem.id,
            questionName: wrappedItem.name,
            model: wrappedItem.model,
          },
        })
        .run();

      setShowPopover(false);
      setMentionRange(null);
    } catch (error) {
      console.error("Failed to create snapshot:", error);
    }
  };

  const handleRecentSelect = (item: RecentItem) => {
    handleSelect({
      ...item,
      description: item.description ?? undefined,
      name: getName(item),
    });
  };

  useEffect(() => {
    if (virtualRef.current && anchorPos) {
      virtualRef.current.style.position = "fixed";
      virtualRef.current.style.left = `${anchorPos.x}px`;
      virtualRef.current.style.top = `${anchorPos.y}px`;
      virtualRef.current.style.width = "1px";
      virtualRef.current.style.height = "1px";
    }
  }, [anchorPos]);

  return (
    <>
      <Popover
        opened={showPopover}
        position="bottom-start"
        width={320}
        shadow="md"
        withinPortal
        closeOnClickOutside={false}
        middlewares={{ flip: true, shift: true }}
        onClose={() => {
          setShowPopover(false);
          setMentionRange(null);
        }}
      >
        <Popover.Target>
          <div
            ref={virtualRef}
            style={{ position: "fixed", pointerEvents: "none" }}
          />
        </Popover.Target>

        <Popover.Dropdown
          style={{
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {query.length > 0 ? (
            <SearchResults
              searchText={query}
              limit={4}
              forceEntitySelect
              onEntitySelect={handleSelect}
              models={MODELS_TO_SEARCH}
              footerComponent={SearchResultsFooter}
              onFooterSelect={() => setModal("question-picker")}
            />
          ) : (
            <RecentsListContent
              isLoading={isRecentsLoading}
              results={filteredRecents}
              onClick={handleRecentSelect}
              footerComponent={SearchResultsFooter}
              onFooterSelect={() => setModal("question-picker")}
            />
          )}
        </Popover.Dropdown>
      </Popover>

      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={async (item) => {
            await handleSelect({
              id: item.id,
              model: item.model,
              name: item.name,
            });
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};
