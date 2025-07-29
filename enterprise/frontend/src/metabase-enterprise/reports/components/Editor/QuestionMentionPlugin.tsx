import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { getSearchIconName } from "metabase/visualizations/visualizations/LinkViz/EntityDisplay";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";
import type {
  RecentItem,
  SearchModel,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

const MODELS_TO_SEARCH: SearchModel[] = ["card", "dataset"];

type InsertionMode = "mention" | "embed" | "text" | "metabot";

interface ExtraItemProps {
  isSelected?: boolean;
  onClick?: () => void;
}

const SearchResultsFooter = ({ isSelected, onClick }: ExtraItemProps) => (
  <Box mx="sm" mb="sm" mt={-8}>
    <SearchResultContainer
      align="center"
      isActive
      isSelected={isSelected}
      onClick={onClick}
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

const MetabotMenuItem = ({ isSelected, onClick }: ExtraItemProps) => (
  <Box mx="sm" mb="sm" mt={-8}>
    <SearchResultContainer
      align="center"
      isActive
      isSelected={isSelected}
      onClick={onClick}
    >
      <IconWrapper active archived={false} type="search">
        <Icon name="metabot" />
      </IconWrapper>

      <ResultNameSection justify="center" gap="xs">
        <Group gap="xs" align="center" wrap="nowrap">
          <ResultTitle
            role="heading"
            data-testid="search-result-item-name"
            truncate
          >
            {t`Ask metabot`}
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
  const [showPopover, setShowPopover] = useState(false);
  const [modal, setModal] = useState<"question-picker" | null>(null);
  const [query, setQuery] = useState("");

  const [mentionRange, setMentionRange] = useState<{
    from: number;
    to: number;
    mode: InsertionMode;
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

  const insertMetabotBlock = useCallback(async () => {
    if (!mentionRange) {
      return;
    }

    const insertPosition = mentionRange.from;

    editor
      .chain()
      .focus()
      .deleteRange(mentionRange)
      .insertContentAt(insertPosition, {
        type: "metabot",
        attrs: {},
      })
      .setTextSelection(insertPosition + 1)
      .run();
  }, [editor, mentionRange]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateHandler = () => {
      const { $from } = editor.state.selection;
      if (mentionRange && showPopover) {
        // Check if we're still in mention mode
        const currentText = editor.state.doc.textBetween(
          mentionRange.from,
          Math.min(editor.state.doc.content.size, $from.pos),
          "",
        );

        if (
          currentText.startsWith("/") ||
          currentText.startsWith("@") ||
          currentText.startsWith("#")
        ) {
          setQuery(currentText.slice(1));
          setMentionRange({
            from: mentionRange.from,
            to: $from.pos,
            mode: mentionRange.mode,
          });
        } else {
          setShowPopover(false);
          setMentionRange(null);
        }
      }

      const text = $from.nodeBefore?.text || "";
      const getInsertionMode = (): InsertionMode | null => {
        // Check if we're typing after @
        if (text.endsWith("@")) {
          return "mention";
        }
        // Check if we're typing after "/" and it's the start of the paragraph
        if (text.trimStart() === "/") {
          return "embed";
        }
        // Check if we're typing after "#" for text input
        if (text.endsWith("#")) {
          return "text";
        }
        if (text.trimStart() === "$") {
          return "metabot";
        }
        return null;
      };

      const mode = getInsertionMode();
      if (mode) {
        const from = $from.pos - 1;
        setMentionRange({ from, to: $from.pos, mode });

        // Get cursor position
        const coords = editor.view.coordsAtPos(from);
        setAnchorPos({ x: coords.left, y: coords.bottom });

        setShowPopover(true);
        setQuery("");
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

  const handleSelect = async (item: UnrestrictedLinkEntity | null) => {
    if (!mentionRange) {
      return;
    }

    if (item === null) {
      setShowPopover(false);
      setMentionRange(null);
      editor.commands.focus();
    }

    const wrappedItem = Search.wrapEntity(item, dispatch);
    const insertPosition = mentionRange.from;

    if (mentionRange.mode === "embed") {
      try {
        editor
          .chain()
          .focus()
          .deleteRange(mentionRange)
          .insertContentAt(insertPosition, {
            type: "cardEmbed",
            attrs: {
              id: wrappedItem.id,
            },
          })
          .setTextSelection(insertPosition + 1)
          .run();

        setShowPopover(false);
        setMentionRange(null);
      } catch (error) {
        console.error("Failed to create snapshot:", error);
      }
    } else if (mentionRange.mode === "mention") {
      editor
        .chain()
        .focus()
        .deleteRange(mentionRange)
        .insertContentAt(insertPosition, {
          type: "smartLink",
          attrs: {
            url: `/question/${wrappedItem.id}`,
            text: wrappedItem.name,
            icon: getSearchIconName(wrappedItem),
          },
        })
        .setTextSelection(insertPosition + 1)
        .run();

      setShowPopover(false);
      setMentionRange(null);
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
              showFooterOnNoResults
            />
          ) : (
            <>
              <RecentsListContent
                isLoading={isRecentsLoading}
                results={filteredRecents}
                onClick={handleRecentSelect}
                headerChildren={[
                  Object.assign(MetabotMenuItem, {
                    onClick: insertMetabotBlock,
                  }),
                ]}
                footerChildren={[
                  Object.assign(SearchResultsFooter, {
                    onClick: () => setModal("question-picker"),
                  }),
                ]}
              />
            </>
          )}
        </Popover.Dropdown>
      </Popover>

      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={async (item) => {
            await handleSelect(item);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
};
