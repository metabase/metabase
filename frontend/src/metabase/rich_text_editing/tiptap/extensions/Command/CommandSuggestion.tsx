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

import {
  CreateNewQuestionFooter,
  MenuItemComponent,
  SearchResultsFooter,
} from "metabase/documents/components/Editor/shared/MenuComponents";
import {
  LoadingSuggestionPaper,
  SuggestionPaper,
} from "metabase/documents/components/Editor/shared/SuggestionPaper";
import { getCurrentDocument } from "metabase/documents/selectors";
import { useSelector } from "metabase/lib/redux";
import { getBrowseAllItemIndex } from "metabase/rich_text_editing/tiptap/extensions/shared/suggestionUtils";
import {
  Box,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import { EntitySearchSection } from "../shared/EntitySearchSection";
import { EMBED_SEARCH_MODELS, LINK_SEARCH_MODELS } from "../shared/constants";
import { useEntitySuggestions } from "../shared/useEntitySuggestions";

import type { CommandProps } from "./CommandExtension";
import CommandS from "./CommandSuggestion.module.css";
import { NewQuestionTypeMenuView } from "./NewQuestionTypeMenuView";
import type { CommandOption, CommandSection } from "./types";
import { useCreateQuestionsMenuItems } from "./use-create-questions-menu-items";
import { getAllCommandSections } from "./utils";

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
          <Icon name={option.icon} size={16} c="inherit" />
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

  const [viewMode, setViewMode] = useState<
    "linkTo" | "embedQuestion" | "newQuestionType" | null
  >(null);
  const [newQuestionType, setNewQuestionType] = useState<
    "notebook" | "native" | null
  >(null);

  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const allCommandSections: CommandSection[] = useMemo(
    getAllCommandSections,
    [],
  );

  const allCommandOptions = useMemo(
    () => allCommandSections.flatMap((section) => section.items),
    [allCommandSections],
  );
  const allowedCommandOptions = useMemo(() => {
    return allCommandOptions.filter(
      (item) => item.isAllowedAtPosition?.(editor) ?? true,
    );
  }, [allCommandOptions, editor]);

  // Filter command options based on query when not in link search mode
  const commandOptions = useMemo(() => {
    if (viewMode === "linkTo" || viewMode === "embedQuestion") {
      return allowedCommandOptions;
    }

    if (!query) {
      return allowedCommandOptions;
    }

    const lowerQuery = query.toLowerCase();
    return allowedCommandOptions.filter((option) =>
      option.label.toLowerCase().includes(lowerQuery),
    );
  }, [viewMode, query, allowedCommandOptions]);

  const createQuestionsMenuItems = useCreateQuestionsMenuItems({
    onSelectItem: setNewQuestionType,
  });

  const areChartsAllowed = !editor.isActive("supportingText");
  const canBrowseAll = areChartsAllowed || viewMode === "linkTo";

  const canCreateNewQuestion =
    createQuestionsMenuItems.length > 0 &&
    viewMode !== "linkTo" &&
    areChartsAllowed;

  const onSelectLinkEntity = useCallback(
    (item: { id: number | string; model: string }) => {
      if (viewMode === "linkTo") {
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
    [viewMode, command, document],
  );

  const onTriggerCreateNewQuestion = useCallback(() => {
    setViewMode("newQuestionType");
  }, []);

  // Use shared entity suggestions for link/embed mode and browse all functionality
  const entitySuggestions = useEntitySuggestions({
    query,
    editor,
    onSelectEntity: onSelectLinkEntity,
    enabled: canBrowseAll,
    searchModels:
      viewMode === "linkTo" ? LINK_SEARCH_MODELS : EMBED_SEARCH_MODELS,
    canFilterSearchModels: false,
    canBrowseAll,
    canCreateNewQuestion,
    onTriggerCreateNewQuestion,
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
      setViewMode("linkTo");
      return;
    }

    if (commandName === "embedQuestion") {
      command({
        clearQuery: true,
        switchToEmbedMode: true,
      });

      setViewMode("embedQuestion");
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
    if (viewMode === "linkTo" || viewMode === "embedQuestion") {
      return searchMenuItems;
    }

    if (viewMode === "newQuestionType") {
      return createQuestionsMenuItems;
    }

    // When searching in command mode, combine search results with matching commands
    if (query && searchMenuItems.length > 0) {
      // Show search results (questions) followed by matching commands
      return [...searchMenuItems, ...commandOptions];
    }

    return commandOptions;
  }, [
    viewMode,
    query,
    searchMenuItems,
    commandOptions,
    createQuestionsMenuItems,
  ]);

  let totalItems = currentItems.length;

  if (viewMode === "linkTo" || viewMode === "embedQuestion") {
    totalItems = searchMenuItems.length + 1 + Number(canCreateNewQuestion); // "Browse all" footer and "New chart"
  } else if (currentItems.length === 0 && query) {
    totalItems = 1 + Number(canCreateNewQuestion); // "Browse all" footer and "New chart"
  }

  const selectItem = (index: number) => {
    if (viewMode) {
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
      } else if (
        currentItems.length === 0 &&
        query &&
        index ===
          getBrowseAllItemIndex(currentItems.length, canCreateNewQuestion)
      ) {
        // Handle browse all when no results
        // Switch to embed mode so selected questions get embedded
        setViewMode("embedQuestion");
        entityHandlers.openModal();
      } else if (
        currentItems.length === 0 &&
        query &&
        index === 0 &&
        canCreateNewQuestion
      ) {
        onTriggerCreateNewQuestion();
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
  }, [currentItems.length, viewMode, searchMenuItems.length]);

  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (viewMode === "linkTo" || viewMode === "embedQuestion") {
        return entityHandlers.onKeyDown({ event });
      }

      if (viewMode === "newQuestionType" && event.key === "Enter") {
        createQuestionsMenuItems[selectedIndex]?.action();
        return true;
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

  if (
    (viewMode === "linkTo" || viewMode === "embedQuestion") &&
    isSearchLoading
  ) {
    return <LoadingSuggestionPaper aria-label={t`Command Dialog`} />;
  }

  return (
    <SuggestionPaper aria-label={t`Command Dialog`}>
      {(viewMode === "linkTo" || viewMode === "embedQuestion") && (
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
          canCreateNewQuestion={canCreateNewQuestion}
          onTriggerCreateNew={onTriggerCreateNewQuestion}
        />
      )}

      {viewMode === "newQuestionType" && (
        <NewQuestionTypeMenuView
          menuItems={createQuestionsMenuItems}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          newQuestionType={newQuestionType}
          setNewQuestionType={setNewQuestionType}
          onSave={entityHandlers.onSaveNewQuestion}
          onClose={() => {
            setNewQuestionType(null);
            setViewMode(null);
          }}
        />
      )}

      {!viewMode && (
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
                allCommandSections
                  .map((section) => ({
                    ...section,
                    items: section.items.filter((item) =>
                      commandOptions.includes(item),
                    ),
                  }))
                  .filter((section) => section.items.length)
                  .map((section, sectionIndex) => (
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
                      {section.items.map((option) => {
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
                  ))
              )}
            </>
          ) : (
            <>
              <Box p="sm" ta="center">
                <Text size="md" c="text-secondary">{t`No results found`}</Text>
              </Box>
              {query && (
                <>
                  {(canCreateNewQuestion || canBrowseAll) && (
                    <Divider my="sm" mx="sm" />
                  )}
                  {canCreateNewQuestion && (
                    <CreateNewQuestionFooter
                      isSelected={selectedIndex === 0}
                      onMouseEnter={() => setSelectedIndex(0)}
                      onClick={onTriggerCreateNewQuestion}
                    />
                  )}

                  {canBrowseAll && (
                    <SearchResultsFooter
                      isSelected={
                        selectedIndex ===
                        getBrowseAllItemIndex(
                          searchMenuItems.length,
                          canCreateNewQuestion,
                        )
                      }
                      onMouseEnter={() =>
                        setSelectedIndex(
                          getBrowseAllItemIndex(
                            searchMenuItems.length,
                            canCreateNewQuestion,
                          ),
                        )
                      }
                      onClick={() => {
                        // Switch to embed mode so selected questions get embedded
                        setViewMode("embedQuestion");
                        entityHandlers.openModal();
                      }}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </SuggestionPaper>
  );
});
