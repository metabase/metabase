import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import {
  Box,
  Card,
  Icon,
  Input,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";
import type {
  SummaryField,
  SummaryFieldItem,
  SummaryFieldSection,
} from "./types";
import { filterFieldSections } from "./utils";

type SummaryFieldListProps = {
  sections: SummaryFieldSection[];
  /** A field was clicked: it replaces what its well holds. */
  onSelect: (field: SummaryField) => void;
  /** A field was alt-clicked (option-clicked on a Mac): it joins what its well holds. */
  onAdd: (field: SummaryField) => void;
};

export function SummaryFieldList({
  sections,
  onSelect,
  onAdd,
}: SummaryFieldListProps) {
  const [searchText, setSearchText] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const isSearching = searchText.trim().length > 0;

  const matchingSections = useMemo(
    () => filterFieldSections(sections, searchText),
    [sections, searchText],
  );

  const toggleSection = (key: string) => {
    setCollapsedKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (nextKeys.has(key)) {
        nextKeys.delete(key);
      } else {
        nextKeys.add(key);
      }
      return nextKeys;
    });
  };

  return (
    <Card
      className={S.fieldListCard}
      radius="lg"
      shadow="xs_outline"
      p="md"
      data-testid="summary-field-list"
    >
      <TextInput
        className={S.searchField}
        classNames={{
          input: S.searchInput,
          section: S.searchFieldSection,
        }}
        variant="unstyled"
        size="xs"
        placeholder={t`Search…`}
        aria-label={t`Search fields`}
        leftSection={<Icon name="search" />}
        rightSectionPointerEvents="all"
        rightSection={
          searchText.length > 0 ? (
            <Input.ClearButton
              c="text-secondary"
              aria-label={t`Clear search`}
              onClick={() => setSearchText("")}
            />
          ) : null
        }
        value={searchText}
        onChange={(event) => setSearchText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setSearchText("");
          }
        }}
      />
      <Box
        className={S.fieldListScroll}
        data-testid="summary-field-list-scroll"
      >
        {matchingSections.length > 0 ? (
          matchingSections.map((section) => (
            <CollapsibleSection
              key={section.key}
              name={section.name}
              isExpanded={isSearching || !collapsedKeys.has(section.key)}
              onToggle={
                isSearching ? undefined : () => toggleSection(section.key)
              }
            >
              {section.items.map((item) => (
                <FieldListItem
                  key={item.key}
                  item={item}
                  searchText={searchText}
                  onSelect={onSelect}
                  onAdd={onAdd}
                />
              ))}
            </CollapsibleSection>
          ))
        ) : (
          <Text className={S.fieldListEmpty} c="text-secondary">
            {t`Nothing matches “${searchText.trim()}”.`}
          </Text>
        )}
      </Box>
    </Card>
  );
}

type CollapsibleSectionProps = {
  name: string;
  isExpanded: boolean;
  onToggle?: () => void;
  children: ReactNode;
};

function CollapsibleSection({
  name,
  isExpanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <Box
      component="section"
      aria-label={name}
      data-testid="summary-field-section"
    >
      <UnstyledButton
        className={S.sectionToggle}
        aria-expanded={isExpanded}
        disabled={onToggle == null}
        onClick={onToggle}
      >
        <Icon
          className={S.sectionChevron}
          name="chevronright"
          size={12}
          aria-hidden
        />
        {name}
      </UnstyledButton>
      {isExpanded && (
        <Box component="ul" className={S.fieldItems}>
          {children}
        </Box>
      )}
    </Box>
  );
}

type FieldListItemProps = {
  item: SummaryFieldItem;
  searchText: string;
  onSelect: (field: SummaryField) => void;
  onAdd: (field: SummaryField) => void;
};

function FieldListItem({
  item,
  searchText,
  onSelect,
  onAdd,
}: FieldListItemProps) {
  const pick = (event: MouseEvent | KeyboardEvent) =>
    event.altKey ? onAdd(item.field) : onSelect(item.field);

  return (
    <li data-testid="summary-field-item">
      <UnstyledButton
        className={S.fieldItem}
        onClick={pick}
        onKeyDown={(event) => {
          // a click from Enter or Space carries no modifier, so the key handles alt itself
          if (event.altKey && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            pick(event);
          }
        }}
      >
        <Icon name={item.icon} c="text-secondary" aria-hidden />
        <MatchedLabel label={item.name} searchText={searchText} />
      </UnstyledButton>
    </li>
  );
}
