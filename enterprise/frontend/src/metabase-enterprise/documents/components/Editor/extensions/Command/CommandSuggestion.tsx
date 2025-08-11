import type { Editor, Range } from "@tiptap/core";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import {
  Box,
  Divider,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { RecentItem, SearchModel, SearchResult } from "metabase-types/api";

import {
  MenuItemComponent,
  SearchResultsFooter,
} from "../../shared/MenuComponents";
import S from "../../shared/MenuItems.module.css";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "../../shared/SuggestionPaper";
import { EMBED_SEARCH_MODELS } from "../shared/constants";
import { useEntitySearch } from "../shared/useEntitySearch";

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
  switchToEmbedMode?: boolean;
  selectItem?: boolean;
  embedItem?: boolean;
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

interface CommandSection {
  title?: string;
  items: CommandOption[];
}

const CommandMenuItem = forwardRef<
  HTMLButtonElement,
  {
    option: CommandOption;
    isSelected?: boolean;
    onClick?: () => void;
  }
>(({ option, isSelected, onClick }, ref) => (
  <UnstyledButton
    ref={ref}
    className={S.menuItem}
    onClick={onClick}
    role="option"
    aria-selected={isSelected}
    aria-label={option.label}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      {option.icon ? (
        <Icon name={option.icon} size={16} color="inherit" />
      ) : option.text ? (
        <Box
          w={16}
          h={16}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text size="xs" fw={700} c="inherit">
            {option.text}
          </Text>
        </Box>
      ) : null}
      <Stack gap={2} style={{ flex: 1 }}>
        <Text size="md" lh="lg" c="inherit">
          {option.label}
        </Text>
        {option.description && (
          <Text size="sm" c="text-light" lh="md">
            {option.description}
          </Text>
        )}
      </Stack>
    </Group>
  </UnstyledButton>
));

CommandMenuItem.displayName = "CommandMenuItem";

const CommandSuggestionComponent = forwardRef<
  SuggestionRef,
  CommandSuggestionProps
>(function CommandSuggestionComponent({ command, editor, query }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [showEmbedSearch, setShowEmbedSearch] = useState(false);
  const [pendingLinkMode, setPendingLinkMode] = useState(false);
  const [pendingEmbedMode, setPendingEmbedMode] = useState(false);
  const [modal, setModal] = useState<"question-picker" | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (pendingLinkMode) {
      setShowLinkSearch(true);
      setPendingLinkMode(false);
    }
    if (pendingEmbedMode) {
      setShowEmbedSearch(true);
      setPendingEmbedMode(false);
    }
  }, [pendingLinkMode, pendingEmbedMode]);

  const effectiveQuery = query;

  const allCommandSections: CommandSection[] = useMemo(
    () => [
      {
        items: [
          {
            icon: "metabot",
            label: t`Ask Metabot`,
            description: t`It wants to help!`,
            command: "metabot",
          },
          {
            icon: "table",
            label: t`Question`,
            description: t`Add a visualization to your document`,
            command: "embedQuestion",
          },
          {
            icon: "link",
            label: t`Link to...`,
            description: t`Link to questions, dashboards, and more`,
            command: "linkTo",
          },
        ],
      },
      {
        title: t`Formatting`,
        items: [
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
        ],
      },
    ],
    [],
  );

  const allCommandOptions = useMemo(
    () => allCommandSections.flatMap((section) => section.items),
    [allCommandSections],
  );

  // Filter command options based on query when not in link search mode
  const commandOptions = useMemo(() => {
    if (showLinkSearch || showEmbedSearch) {
      return allCommandOptions;
    }

    if (!query) {
      return allCommandOptions;
    }

    const lowerQuery = query.toLowerCase();
    return allCommandOptions.filter((option) =>
      option.label.toLowerCase().includes(lowerQuery),
    );
  }, [allCommandOptions, query, showLinkSearch, showEmbedSearch]);

  const handleRecentSelect = useCallback(
    (item: RecentItem) => {
      if (showEmbedSearch) {
        command({
          embedItem: true,
          entityId: item.id,
          model: item.model,
        });
      } else {
        command({
          selectItem: true,
          entityId: item.id,
          model: item.model,
        });
      }
    },
    [command, showEmbedSearch],
  );

  const handleSearchResultSelect = useCallback(
    (item: SearchResult) => {
      if (showEmbedSearch) {
        command({
          embedItem: true,
          entityId: item.id,
          model: item.model,
        });
      } else {
        command({
          selectItem: true,
          entityId: item.id,
          model: item.model,
        });
      }
    },
    [command, showEmbedSearch],
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

    if (commandName === "embedQuestion") {
      setPendingEmbedMode(true);
      command({
        clearQuery: true,
        switchToEmbedMode: true,
      });
      return;
    }

    if (commandName === "metabot") {
      command({
        command: "metabot",
      });
      return;
    }

    command({
      command: commandName,
    });
  };

  // Search for entities when in link/embed mode
  const {
    menuItems: linkMenuItems,
    isLoading: isLinkSearchLoading,
    searchResults,
  } = useEntitySearch({
    query: effectiveQuery,
    onSelectRecent: handleRecentSelect,
    onSelectSearchResult: handleSearchResultSelect,
    enabled: showLinkSearch || showEmbedSearch,
    searchModels: showEmbedSearch ? EMBED_SEARCH_MODELS : undefined,
  });

  const { menuItems: searchMenuItems } = useEntitySearch({
    query,
    onSelectRecent: useCallback(
      (item: RecentItem) => {
        command({
          embedItem: true,
          entityId: item.id,
          model: item.model,
        });
      },
      [command],
    ),
    onSelectSearchResult: useCallback(
      (item: SearchResult) => {
        command({
          embedItem: true,
          entityId: item.id,
          model: item.model,
        });
      },
      [command],
    ),
    enabled: !showLinkSearch && !showEmbedSearch && !!query,
    searchModels: EMBED_SEARCH_MODELS,
  });

  const currentItems = useMemo(() => {
    if (showLinkSearch || showEmbedSearch) {
      return linkMenuItems;
    }

    // When searching in command mode, combine search results with matching commands
    if (query && searchMenuItems.length > 0) {
      // Show search results (questions) followed by matching commands
      return [...searchMenuItems, ...commandOptions];
    }

    return commandOptions;
  }, [
    showLinkSearch,
    showEmbedSearch,
    linkMenuItems,
    query,
    searchMenuItems,
    commandOptions,
  ]);

  const totalItems =
    showLinkSearch || showEmbedSearch
      ? linkMenuItems.length + 1
      : currentItems.length;

  const selectItem = (index: number) => {
    if (showLinkSearch || showEmbedSearch) {
      if (index < linkMenuItems.length) {
        linkMenuItems[index].action();
      } else {
        setModal("question-picker");
      }
    } else {
      // When searching in command mode, handle both entity results and commands
      if (query && searchMenuItems.length > 0) {
        if (index < searchMenuItems.length) {
          searchMenuItems[index].action();
        } else {
          const commandIndex = index - searchMenuItems.length;
          if (commandIndex < commandOptions.length) {
            executeCommand(commandOptions[commandIndex].command);
          }
        }
      } else {
        if (index < commandOptions.length) {
          executeCommand(commandOptions[index].command);
        }
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
  }, [
    currentItems.length,
    showLinkSearch,
    showEmbedSearch,
    searchMenuItems.length,
  ]);

  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

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
    if (showEmbedSearch) {
      command({
        embedItem: true,
        entityId: item.id,
        model: item.model as SearchModel,
      });
    } else {
      command({
        selectItem: true,
        entityId: item.id,
        model: item.model as SearchModel,
      });
    }
    setModal(null);
  };

  const handleModalClose = () => {
    setModal(null);
    setTimeout(() => {
      editor.commands.focus();
    }, 0);
  };

  if ((showLinkSearch || showEmbedSearch) && isLinkSearchLoading) {
    return <LoadingSuggestionPaper aria-label={t`Command Dialog`} />;
  }

  return (
    <SuggestionPaper aria-label={t`Command Dialog`}>
      {showLinkSearch || showEmbedSearch ? (
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
          !isLinkSearchLoading ? (
            <Box p="sm" ta="center">
              <Text size="sm" c="dimmed">{t`No results found`}</Text>
            </Box>
          ) : null}
          <Divider my="xs" mx="sm" />
          <SearchResultsFooter
            isSelected={selectedIndex === linkMenuItems.length}
            onClick={() => setModal("question-picker")}
          />
        </>
      ) : (
        <>
          {commandOptions.length > 0 ||
          (query && searchMenuItems.length > 0) ? (
            <>
              {query && searchMenuItems.length > 0 ? (
                // When searching, show question search results first, then matching commands
                <>
                  {searchMenuItems.map((item, index) => (
                    <MenuItemComponent
                      key={`search-${index}`}
                      item={item}
                      isSelected={selectedIndex === index}
                      onClick={() => selectItem(index)}
                    />
                  ))}
                  {searchMenuItems.length > 0 && commandOptions.length > 0 && (
                    <Divider my="xs" mx="sm" />
                  )}
                  {commandOptions.map((option, cmdIndex) => {
                    const index = searchMenuItems.length + cmdIndex;
                    return (
                      <CommandMenuItem
                        key={`cmd-${cmdIndex}`}
                        ref={(el) => (itemRefs.current[index] = el)}
                        option={option}
                        isSelected={selectedIndex === index}
                        onClick={() => selectItem(index)}
                      />
                    );
                  })}
                </>
              ) : (
                // When not searching, show sections
                allCommandSections.map((section, sectionIndex) => {
                  const filteredItems = section.items.filter((item) =>
                    commandOptions.includes(item),
                  );
                  if (filteredItems.length === 0) {
                    return null;
                  }

                  return (
                    <Box key={sectionIndex}>
                      {section.title && sectionIndex > 0 && (
                        <Box>
                          <Divider my="xs" mx="sm" />
                          <Text
                            size="sm"
                            c="text-primary"
                            px="sm"
                            pt="xs"
                            pb="xs"
                          >
                            {section.title}
                          </Text>
                        </Box>
                      )}
                      {filteredItems.map((option) => {
                        const index = commandOptions.indexOf(option);
                        return (
                          <CommandMenuItem
                            key={index}
                            ref={(el) => (itemRefs.current[index] = el)}
                            option={option}
                            isSelected={selectedIndex === index}
                            onClick={() => selectItem(index)}
                          />
                        );
                      })}
                    </Box>
                  );
                })
              )}
            </>
          ) : (
            <Box p="sm" ta="center">
              <Text size="sm" c="dimmed">{t`No results found`}</Text>
            </Box>
          )}
        </>
      )}
      {modal === "question-picker" && (
        <QuestionPickerModal
          onChange={handleModalSelect}
          onClose={handleModalClose}
        />
      )}
    </SuggestionPaper>
  );
});

export const CommandSuggestion = CommandSuggestionComponent;
