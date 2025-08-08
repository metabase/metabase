import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { useListRecentsQuery, useSearchQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Group, Icon, type IconName, Loader, Text } from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import styles from "../../Editor.module.css";
import type { MenuItem } from "../../shared/MenuComponents";
import {
  MenuItemComponent,
  SearchResultsFooter,
} from "../../shared/MenuComponents";
import {
  buildRecentsMenuItems,
  buildSearchMenuItems,
  isRecentQuestion,
} from "../shared/suggestionUtils";

interface CommandSuggestionProps {
  items: SearchResult[];
  command: (item: CommandItem) => void;
  editor: Editor;
  range: Range;
  query: string;
}

interface CommandItem {
  command?: string;
  clearQuery?: boolean;
  switchToLinkMode?: boolean;
  selectItem?: boolean;
  entityId?: number | string;
  model?: string;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface CommandOption {
  icon?: IconName;
  text?: string;
  label: string;
  description?: string;
  command: string;
}

interface LinkMenuItem {
  icon: IconName;
  label: string;
  id: number | string;
  model: SearchModel;
  action: () => void;
}

const MODELS_TO_SEARCH: SearchModel[] = [
  "card",
  "dataset",
  "dashboard",
  "collection",
  "table",
  "database",
];

const CommandMenuItem = ({
  option,
  isSelected,
  onClick,
}: {
  option: CommandOption;
  isSelected?: boolean;
  onClick?: () => void;
}) => (
  <Box
    p="sm"
    className={styles.suggestionMenuItem}
    data-selected={isSelected || undefined}
    onClick={onClick}
    role="listitem"
    aria-label={option.label}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      {option.icon ? (
        <Icon
          name={option.icon}
          size={16}
          color="var(--mb-color-text-medium)"
        />
      ) : option.text ? (
        <Group w={16} h={16} gap={0} align="center" justify="center">
          <Text size="xs" fw={700} c="text-medium">
            {option.text}
          </Text>
        </Group>
      ) : null}
      <Box>
        <Text size="md" fw={500}>
          {option.label}
        </Text>
        {option.description && (
          <Text size="sm" c="text-medium">
            {option.description}
          </Text>
        )}
      </Box>
    </Group>
  </Box>
);

CommandMenuItem.displayName = "CommandMenuItem";

const CommandSuggestionComponent = forwardRef<
  SuggestionRef,
  CommandSuggestionProps
>(function CommandSuggestionComponent({ command, editor, query }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [pendingLinkMode, setPendingLinkMode] = useState(false);
  const [modal, setModal] = useState<"question-picker" | null>(null);

  const { data: recents = [], isLoading: isRecentsLoading } =
    useListRecentsQuery(undefined, { refetchOnMountOrArgChange: true });

  const filteredRecents = recents.filter(isRecentQuestion).slice(0, 4);

  useEffect(() => {
    if (pendingLinkMode) {
      setShowLinkSearch(true);
      setPendingLinkMode(false);
    }
  }, [pendingLinkMode]);

  const effectiveQuery = query;
  const { data: searchResponse, isLoading: isSearchLoading } = useSearchQuery(
    {
      q: effectiveQuery,
      models: MODELS_TO_SEARCH,
      limit: 4,
    },
    {
      skip: !showLinkSearch || !effectiveQuery || effectiveQuery.length === 0,
    },
  );

  const searchResults = useMemo(
    () => (searchResponse?.data as SearchResult[]) ?? [],
    [searchResponse],
  );

  const allCommandOptions: CommandOption[] = useMemo(
    () => [
      {
        text: "H1",
        label: t`Heading 1`,
        command: "heading1",
      },
      {
        text: "H2",
        label: t`Heading 2`,
        command: "heading2",
      },
      {
        text: "H3",
        label: t`Heading 3`,
        command: "heading3",
      },
      {
        icon: "list",
        label: t`Bullet list`,
        command: "bulletList",
      },
      {
        icon: "ordered_list",
        label: t`Numbered list`,
        command: "orderedList",
      },
      {
        icon: "quote",
        label: t`Quote`,
        command: "blockquote",
      },
      {
        icon: "code_block",
        label: t`Code block`,
        command: "codeBlock",
      },
      {
        icon: "link",
        label: t`Link to...`,
        description: t`Insert a reference to a question, dashboard, or collection`,
        command: "linkTo",
      },
    ],
    [],
  );

  // Filter command options based on query when not in link search mode
  const commandOptions = useMemo(() => {
    if (showLinkSearch) {
      return allCommandOptions;
    }

    if (!query) {
      return allCommandOptions;
    }

    const lowerQuery = query.toLowerCase();
    return allCommandOptions.filter((option) =>
      option.label.toLowerCase().includes(lowerQuery),
    );
  }, [allCommandOptions, query, showLinkSearch]);

  const handleRecentSelect = useCallback(
    (item: RecentItem) => {
      command({
        selectItem: true,
        entityId: item.id,
        model: item.model,
      });
    },
    [command],
  );

  const handleSearchResultSelect = useCallback(
    (item: SearchResult) => {
      command({
        selectItem: true,
        entityId: item.id,
        model: item.model,
      });
    },
    [command],
  );

  const executeCommand = (commandName: string) => {
    if (commandName === "linkTo") {
      setPendingLinkMode(true);
      command({
        clearQuery: true,
        switchToLinkMode: true,
      });
      return;
    }

    command({
      command: commandName,
    });
  };

  const linkMenuItems = useMemo(() => {
    const items: Array<LinkMenuItem | MenuItem> = [];

    if (effectiveQuery.length > 0) {
      if (!isSearchLoading && searchResults.length > 0) {
        items.push(
          ...buildSearchMenuItems(searchResults, handleSearchResultSelect),
        );
      }
    } else {
      if (!isRecentsLoading && filteredRecents.length > 0) {
        items.push(
          ...buildRecentsMenuItems(filteredRecents, handleRecentSelect),
        );
      }
    }

    return items as LinkMenuItem[];
  }, [
    effectiveQuery,
    searchResults,
    isSearchLoading,
    filteredRecents,
    isRecentsLoading,
    handleRecentSelect,
    handleSearchResultSelect,
  ]);

  const currentItems = showLinkSearch ? linkMenuItems : commandOptions;
  const totalItems = showLinkSearch
    ? linkMenuItems.length + 1
    : commandOptions.length;

  const selectItem = (index: number) => {
    if (showLinkSearch) {
      if (index < linkMenuItems.length) {
        linkMenuItems[index].action();
      } else {
        setModal("question-picker");
      }
    } else {
      if (index < commandOptions.length) {
        executeCommand(commandOptions[index].command);
      }
    }
  };

  const upHandler = () => {
    setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const downHandler = () => {
    setSelectedIndex((prev) => (prev + 1) % totalItems);
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [currentItems.length, showLinkSearch]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === "ArrowUp") {
        upHandler();
        return true;
      }

      if (event.key === "ArrowDown") {
        downHandler();
        return true;
      }

      if (event.key === "Enter") {
        enterHandler();
        return true;
      }

      return false;
    },
  }));

  const handleModalSelect = (item: QuestionPickerValueItem) => {
    command({
      selectItem: true,
      entityId: item.id,
      model: item.model as SearchModel,
    });
    setModal(null);
  };

  const handleModalClose = () => {
    setModal(null);
    setTimeout(() => {
      editor.commands.focus();
    }, 0);
  };

  if (
    showLinkSearch &&
    ((isRecentsLoading && effectiveQuery.length === 0) ||
      (isSearchLoading && effectiveQuery.length > 0))
  ) {
    return (
      <Group justify="center" p="sm">
        <Loader size="sm" />
      </Group>
    );
  }

  return (
    <Box
      className={styles.suggestionPopup}
      aria-label={t`Command Dialog`}
      role="dialog"
    >
      <Box className={styles.suggestionScroll}>
        {showLinkSearch &&
        ((isRecentsLoading && effectiveQuery.length === 0) ||
          (isSearchLoading && effectiveQuery.length > 0)) ? (
          <Group justify="center" p="sm">
            <Loader size="sm" />
          </Group>
        ) : showLinkSearch ? (
          <>
            {linkMenuItems.map((item, index) => (
              <MenuItemComponent
                key={index}
                item={item}
                isSelected={selectedIndex === index}
                onClick={() => selectItem(index)}
              />
            ))}
            {effectiveQuery.length > 0 &&
            searchResults.length === 0 &&
            !isSearchLoading ? (
              <Box p="sm">
                <Text size="md" c="text-medium" ta="center">
                  {t`No results found`}
                </Text>
              </Box>
            ) : null}
            <SearchResultsFooter
              isSelected={selectedIndex === linkMenuItems.length}
              onClick={() => setModal("question-picker")}
            />
          </>
        ) : (
          <>
            {commandOptions.length > 0 ? (
              commandOptions.map((option, index) => (
                <CommandMenuItem
                  key={index}
                  option={option}
                  isSelected={selectedIndex === index}
                  onClick={() => selectItem(index)}
                />
              ))
            ) : (
              <Box p="sm">
                <Text size="md" c="text-medium" ta="center">
                  {t`No commands found`}
                </Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={handleModalSelect}
          onClose={handleModalClose}
        />
      )}
    </Box>
  );
});

export const CommandSuggestion = CommandSuggestionComponent;
