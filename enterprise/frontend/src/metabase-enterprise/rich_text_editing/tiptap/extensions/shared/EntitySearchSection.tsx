import { t } from "ttag";

import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker/components/QuestionPickerModal";
import type { QuestionPickerValueItem } from "metabase/common/components/Pickers/QuestionPicker/types";
import { Box, Divider, Text } from "metabase/ui";
import type { MenuItem } from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import {
  CreateNewQuestionFooter,
  MenuItemComponent,
  SearchResultsFooter,
} from "metabase-enterprise/documents/components/Editor/shared/MenuComponents";
import type { SearchResult } from "metabase-types/api";

import { getBrowseAllItemIndex } from "./suggestionUtils";

interface EntitySearchSectionProps {
  menuItems: MenuItem[];
  selectedIndex: number;
  onItemSelect: (index: number) => void;
  onFooterClick: () => void;
  query: string;
  searchResults: SearchResult[];
  modal: "question-picker" | null;
  onModalSelect: (item: QuestionPickerValueItem) => void;
  onModalClose: () => void;
  onItemHover: (index: number) => void;
  canBrowseAll?: boolean;
  canCreateNewQuestion?: boolean;
  selectedSearchModelName?: string;
  onTriggerCreateNew?: () => void;
}

export function EntitySearchSection({
  menuItems,
  selectedIndex,
  onItemSelect,
  onFooterClick,
  query,
  searchResults,
  modal,
  onModalSelect,
  onModalClose,
  onItemHover,
  selectedSearchModelName,
  canBrowseAll,
  canCreateNewQuestion,
  onTriggerCreateNew,
}: EntitySearchSectionProps) {
  const hasNoItems = menuItems.length === 0 && searchResults.length === 0;
  const shouldShowNoResults = query.length > 0 && hasNoItems;

  const browseAllItemIndex = getBrowseAllItemIndex(
    menuItems.length,
    canCreateNewQuestion,
  );

  return (
    <>
      {selectedSearchModelName && (
        <Box py="xs">
          <Text size="sm" c="text-disabled" fw="bold">
            {selectedSearchModelName}
          </Text>
        </Box>
      )}
      {menuItems.map((item, index) => (
        <MenuItemComponent
          key={index}
          item={item}
          isSelected={selectedIndex === index}
          onClick={() => onItemSelect(index)}
          onMouseEnter={() => onItemHover(index)}
        />
      ))}

      {shouldShowNoResults ? (
        <Box p="sm" ta="center">
          <Text size="md" c="text-secondary">{t`No results found`}</Text>
        </Box>
      ) : null}

      {(shouldShowNoResults || !hasNoItems) &&
        (canCreateNewQuestion || canBrowseAll) && <Divider my="sm" mx="sm" />}

      {canCreateNewQuestion && (
        <CreateNewQuestionFooter
          isSelected={selectedIndex === menuItems.length}
          onClick={onTriggerCreateNew}
          onMouseEnter={() => onItemHover(menuItems.length)}
        />
      )}

      {canBrowseAll && (
        <>
          <SearchResultsFooter
            isSelected={selectedIndex === browseAllItemIndex}
            onClick={onFooterClick}
            onMouseEnter={() => onItemHover(browseAllItemIndex)}
          />

          {modal === "question-picker" && (
            <QuestionPickerModal
              onChange={onModalSelect}
              onClose={onModalClose}
            />
          )}
        </>
      )}
    </>
  );
}
