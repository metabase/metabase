import type { Editor, Range } from "@tiptap/core";
import {
  type DOMAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_METABOT } from "metabase/plugins";
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
import {
  MenuItemComponent,
  SearchResultsFooter,
} from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "metabase-enterprise/documents/components/Editor/shared/SuggestionPaper";
import { getCurrentDocument } from "metabase-enterprise/documents/selectors";
import type { SearchResult } from "metabase-types/api";

import { EntitySearchSection } from "../shared/EntitySearchSection";
import { EMBED_SEARCH_MODELS, LINK_SEARCH_MODELS } from "../shared/constants";
import { useEntitySuggestions } from "../shared/useEntitySuggestions";

import type { CommandProps } from "./CommandExtension";
import CommandS from "./CommandSuggestion.module.css";

export interface CommandSuggestionProps {
  items: SearchResult[];
  command: (item: CommandProps) => void;
  editor: Editor;
  range: Range;
  query: string;
}

interface SuggestionRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface CommandOption {
  icon?: IconName;
  text?: string;
  label: string;
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
  } & DOMAttributes<HTMLButtonElement>
>(function CommandMenuItem({ option, isSelected, onClick, ...rest }, ref) {
  return (
    <UnstyledButton
      ref={ref}
      className={CommandS.commandButton}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
      aria-label={option.label}
      {...rest}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        {option.icon ? (
          <Icon name={option.icon} size={16} color="inherit" />
        ) : option.text ? (
          <Box w={16} h={16} className={CommandS.iconContainer}>
            <Text size="xs" fw={700} c="inherit">
              {option.text}
            </Text>
          </Box>
        ) : null}
        <Stack gap={2} className={CommandS.commandItemStack}>
          <Text size="md" lh="lg" c="inherit">
            {option.label}
          </Text>
        </Stack>
      </Group>
    </UnstyledButton>
  );
});

export const CommandSuggestion = forwardRef<
  SuggestionRef,
  CommandSuggestionProps
>(function CommandSuggestionComponent({ command, editor, query }, ref) {
  const document = useSelector(getCurrentDocument);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showLinkSearch, setShowLinkSearch] = useState(false);
  const [showEmbedSearch, setShowEmbedSearch] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const allCommandSections: CommandSection[] = useMemo(
    () => [
      {
        items: [
          ...(PLUGIN_METABOT.isEnabled()
            ? ([
                {
                  icon: "metabot",
                  label: t`Ask Metabot`,
                  command: "metabot",
                },
              ] as const)
            : []),
          {
            icon: "lineandbar",
            label: t`Chart`,
            command: "embedQuestion",
          },
          {
            icon: "link",
            label: t`Link`,
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

  const onSelectLinkEntity = useCallback(
    (item: { id: number | string; model: string }) => {
      if (showLinkSearch) {
        command({
          selectItem: true,
          entityId: item.id,
          model: item.model,
          document,
        });
      } else {
        command({
          embedItem: true,
          entityId: item.id,
          model: item.model,
          document,
        });
      }
    },
    [command, showLinkSearch, document],
  );

  // Use shared entity suggestions for link/embed mode and browse all functionality
  const entitySuggestions = useEntitySuggestions({
    query,
    editor,
    onSelectEntity: onSelectLinkEntity,
    enabled: true,
    searchModels: showLinkSearch ? LINK_SEARCH_MODELS : EMBED_SEARCH_MODELS,
    canBrowseAll: true,
  });

  const {
    menuItems: searchMenuItems,
    isLoading: isSearchLoading,
    searchResults,
    selectedIndex: entitySelectedIndex,
    modal: entityModal,
    handlers: entityHandlers,
  } = entitySuggestions;

  const executeCommand = (commandName: string) => {
    if (commandName === "linkTo") {
      command({
        clearQuery: true,
        switchToLinkMode: true,
      });
      setShowLinkSearch(true);
      return;
    }

    if (commandName === "embedQuestion") {
      command({
        clearQuery: true,
        switchToEmbedMode: true,
      });

      if (searchMenuItems.length === 0) {
        entityHandlers.openModal();
      }
      setShowEmbedSearch(true);
      return;
    }

    if (commandName === "metabot") {
      command({
        command: "metabot",
        document,
      });
      return;
    }

    command({
      command: commandName,
    });
  };

  const currentItems = useMemo(() => {
    if (showLinkSearch || showEmbedSearch) {
      return searchMenuItems;
    }

    // When searching in command mode, combine search results with matching commands
    if (query && searchMenuItems.length > 0) {
      // Show search results (questions) followed by matching commands
      return [...searchMenuItems, ...commandOptions];
    }

    return commandOptions;
  }, [showLinkSearch, showEmbedSearch, query, searchMenuItems, commandOptions]);
  let totalItems = currentItems.length;

  if (showLinkSearch || showEmbedSearch) {
    totalItems = searchMenuItems.length + 1;
  } else if (currentItems.length === 0 && query) {
    totalItems = 1; // Just the browse all footer
  }

  const selectItem = (index: number) => {
    if (showLinkSearch || showEmbedSearch) {
      entityHandlers.selectItem(index);
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
      } else if (currentItems.length === 0 && query && index === 0) {
        // Handle browse all when no results
        // Switch to embed mode so selected questions get embedded
        setShowEmbedSearch(true);
        entityHandlers.openModal();
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
      if (showLinkSearch || showEmbedSearch) {
        return entityHandlers.onKeyDown({ event });
      }

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

  if ((showLinkSearch || showEmbedSearch) && isSearchLoading) {
    return <LoadingSuggestionPaper aria-label={t`Command Dialog`} />;
  }

  return (
    <SuggestionPaper aria-label={t`Command Dialog`}>
      {showLinkSearch || showEmbedSearch ? (
        <EntitySearchSection
          menuItems={searchMenuItems}
          selectedIndex={entitySelectedIndex}
          onItemSelect={entityHandlers.selectItem}
          onItemHover={entityHandlers.hoverHandler}
          onFooterClick={entityHandlers.openModal}
          query={query}
          searchResults={searchResults}
          modal={entityModal}
          onModalSelect={entityHandlers.handleModalSelect}
          onModalClose={entityHandlers.handleModalClose}
          canBrowseAll
        />
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
                      onMouseEnter={() => setSelectedIndex(index)}
                    />
                  ))}
                  {searchMenuItems.length > 0 && commandOptions.length > 0 && (
                    <Divider my="sm" mx="sm" />
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
                        onMouseEnter={() => setSelectedIndex(index)}
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
                          <Divider my="sm" mx="sm" />
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
                            onMouseEnter={() => setSelectedIndex(index)}
                          />
                        );
                      })}
                    </Box>
                  );
                })
              )}
            </>
          ) : (
            <>
              <Box p="sm" ta="center">
                <Text size="md" c="text-medium">{t`No results found`}</Text>
              </Box>
              {query && (
                <>
                  <Divider my="sm" mx="sm" />
                  <SearchResultsFooter
                    isSelected={selectedIndex === currentItems.length}
                    onClick={() => {
                      // Switch to embed mode so selected questions get embedded
                      setShowEmbedSearch(true);
                      entityHandlers.openModal();
                    }}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
    </SuggestionPaper>
  );
});
