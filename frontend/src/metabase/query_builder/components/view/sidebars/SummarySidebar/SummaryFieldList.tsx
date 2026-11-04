import { type ReactNode, useMemo, useState } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import type { ContentTranslationFunction } from "metabase/content-translation/types";
import {
  Box,
  Card,
  Icon,
  Input,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";
import type * as Lib from "metabase-lib";

import { MatchedLabel } from "./MatchedLabel";
import S from "./SummarySidebar.module.css";
import {
  type SummaryFieldItem,
  type SummaryFieldSection,
  filterFieldSections,
  getFieldSections,
} from "./utils";

type SummaryFieldListProps = {
  query: Lib.Query;
  stageIndex: number;
};

function translateSections(
  sections: SummaryFieldSection[],
  tc: ContentTranslationFunction,
): SummaryFieldSection[] {
  return sections.map((section) => ({
    ...section,
    name: tc(section.name),
    items: section.items.map((item) => ({ ...item, name: tc(item.name) })),
  }));
}

/**
 * The fields a summary can be built from, in collapsible sections: measures, metrics, then a
 * section per table the query reaches. A search keeps only the matching fields and opens every
 * section, so no match is hidden.
 */
export function SummaryFieldList({ query, stageIndex }: SummaryFieldListProps) {
  const tc = useTranslateContent();
  const [searchText, setSearchText] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const isSearching = searchText.trim().length > 0;

  const sections = useMemo(
    () => translateSections(getFieldSections(query, stageIndex), tc),
    [query, stageIndex, tc],
  );
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
      <Box className={S.fieldListScroll}>
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
  /** Absent while the section can't collapse, i.e. during a search. */
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
};

function FieldListItem({ item, searchText }: FieldListItemProps) {
  return (
    <Box
      component="li"
      className={S.fieldItem}
      data-testid="summary-field-item"
    >
      <Icon name={item.icon} c="text-secondary" aria-hidden />
      <MatchedLabel label={item.name} searchText={searchText} />
    </Box>
  );
}
