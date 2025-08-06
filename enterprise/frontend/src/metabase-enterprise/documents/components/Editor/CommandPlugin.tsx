import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { cardApi, useListRecentsQuery } from "metabase/api";
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
import { Box, Group, Icon, Popover, Text } from "metabase/ui";
import type {
  RecentItem,
  SearchModel,
  UnrestrictedLinkEntity,
} from "metabase-types/api";

const COMMAND_MODELS_TO_SEARCH: SearchModel[] = ["card", "dataset"];

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
  <Box>
    <SearchResultContainer isActive isSelected={isSelected} onClick={onClick}>
      <IconWrapper active archived={false} type="search">
        <Icon name="metabot" />
      </IconWrapper>

      <ResultNameSection gap="xs">
        <Group gap="xs" align="center" wrap="nowrap">
          <ResultTitle
            role="heading"
            data-testid="search-result-item-name"
            truncate
          >
            {t`Ask metabot`}
          </ResultTitle>
        </Group>
        <Text size="sm" c="text-medium">
          {t`It wants to help!`}
        </Text>
      </ResultNameSection>
    </SearchResultContainer>
  </Box>
);

interface CommandPluginProps {
  editor: Editor;
}

export const CommandPlugin = ({ editor }: CommandPluginProps) => {
  const dispatch = useDispatch();
  const [showPopover, setShowPopover] = useState(false);
  const [modal, setModal] = useState<"question-picker" | null>(null);
  const [query, setQuery] = useState("");

  const [commandRange, setCommandRange] = useState<{
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
    .filter((item) =>
      COMMAND_MODELS_TO_SEARCH.includes(item.model as SearchModel),
    )
    .slice(0, 4);

  const insertMetabotBlock = useCallback(async () => {
    if (!commandRange) {
      return;
    }

    const insertPosition = commandRange.from;

    editor
      .chain()
      .focus()
      .deleteRange(commandRange)
      .insertContentAt(insertPosition, {
        type: "metabot",
        attrs: {},
      })
      .setTextSelection(insertPosition + 1)
      .run();

    setShowPopover(false);
    setCommandRange(null);
  }, [editor, commandRange]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateHandler = () => {
      const { $from } = editor.state.selection;
      if (commandRange && showPopover) {
        // Check if we're still in command mode
        const currentText = editor.state.doc.textBetween(
          commandRange.from,
          Math.min(editor.state.doc.content.size, $from.pos),
          "",
        );

        if (currentText.startsWith("/")) {
          setQuery(currentText.slice(1));
          setCommandRange({
            from: commandRange.from,
            to: $from.pos,
          });
        } else {
          setShowPopover(false);
          setCommandRange(null);
        }
      }

      const text = $from.nodeBefore?.text || "";
      // Check if we're typing after "/" and it's the start of the paragraph
      if (text.trimStart() === "/") {
        const from = $from.pos - 1;
        setCommandRange({ from, to: $from.pos });

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
        setCommandRange(null);
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
  }, [editor, commandRange, showPopover]);

  const handleSelect = async (item: UnrestrictedLinkEntity | null) => {
    if (!commandRange) {
      return;
    }

    if (item === null) {
      setShowPopover(false);
      setCommandRange(null);
      editor.commands.focus();
      return;
    }

    const wrappedItem = Search.wrapEntity(item, dispatch);
    const insertPosition = commandRange.from;

    try {
      // Fetch the full card data using RTK Query
      const { data: originalCard } = await dispatch(
        cardApi.endpoints.getCard.initiate({ id: wrappedItem.id }),
      );

      if (!originalCard) {
        throw new Error("Failed to fetch card data");
      }

      // Simply insert the original card ID - backend will handle cloning when saving document
      editor
        .chain()
        .focus()
        .deleteRange(commandRange)
        .insertContentAt(insertPosition, {
          type: "cardEmbed",
          attrs: {
            id: originalCard.id,
          },
        })
        .setTextSelection(insertPosition + 1)
        .run();

      setShowPopover(false);
      setCommandRange(null);
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
          setCommandRange(null);
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
              models={COMMAND_MODELS_TO_SEARCH}
              footerComponent={SearchResultsFooter}
              onFooterSelect={() => setModal("question-picker")}
              showFooterOnNoResults
            />
          ) : (
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
