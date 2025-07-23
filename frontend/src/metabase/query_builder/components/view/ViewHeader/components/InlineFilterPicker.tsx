import { useMemo, useState } from "react";
import { t } from "ttag";

import type { Section as BaseSection } from "metabase/common/components/AccordionList";
import { QueryColumnInfoIcon } from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { isNotNull } from "metabase/lib/types";
import type { FilterChangeOpts } from "metabase/querying/filters/components/FilterPicker/types";
import { getGroupName } from "metabase/querying/filters/utils/groups";
import { Box, DelayGroup, Flex, Icon, Stack, Text, TextInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import FilterSidesheetS from "./FilterHeaderButton.module.css";
import { InlineFieldFilter } from "./InlineFieldFilter";

type ColumnListItem = {
  name: string;
  displayName: string;
  filterPositions?: number[];
  column: Lib.ColumnMetadata;
  query: Lib.Query;
  stageIndex: number;
  combinedName: string;
  combinedDisplayName: string;
  longDisplayName: string;
};

type SegmentListItem = {
  name: string;
  displayName: string;
  segment: any; // Lib.Segment
  stageIndex: number;
};

type Item = ColumnListItem | SegmentListItem;

type Section = BaseSection<Item> & {
  key?: string;
};

export interface InlineFilterPickerProps {
  query: Lib.Query;
  stageIndexes: number[];
  onChange: (newQuery: Lib.Query, opts: FilterChangeOpts) => void;
  onClose?: () => void;
}

const isSegmentListItem = (item: Item): item is SegmentListItem => {
  return (item as SegmentListItem).segment != null;
};

export function InlineFilterPicker({
  query,
  stageIndexes,
  onChange,
  onClose: _onClose,
}: InlineFilterPickerProps) {
  const [searchText, setSearchText] = useState("");

  const sections = useMemo(() => {
    try {
      const allSections = getSections({ query, stageIndexes });
      
      if (!searchText.trim()) {
        return allSections;
      }

      // Filter sections and items based on search text
      const searchLower = searchText.toLowerCase();
      return allSections.map(section => ({
        ...section,
        items: section.items?.filter(item => 
          item.displayName.toLowerCase().includes(searchLower) ||
          item.name.toLowerCase().includes(searchLower)
        ) || []
      })).filter(section => (section.items?.length || 0) > 0);
    } catch (error) {
      console.error("Error getting sections:", error);
      return [];
    }
  }, [query, stageIndexes, searchText]);

  const handleFilterChange = (
    column: Lib.ColumnMetadata,
    stageIndex: number,
  ) => (filter: Lib.ExpressionClause, opts: FilterChangeOpts) => {
    const newQuery = Lib.dropEmptyStages(Lib.filter(query, stageIndex, filter));
    onChange(newQuery, opts);
    
    // Don't close the sidesheet when applying filters - let users add multiple filters
  };

  const handleSegmentChange = (item: SegmentListItem) => {
    const newQuery = Lib.dropEmptyStages(Lib.filter(query, item.stageIndex, item.segment));
    onChange(newQuery, { run: true });
    // Don't close the sidesheet when applying segments - let users add multiple filters
  };

  const hasNoResults = sections.length === 0;
  const emptyMessage = searchText.trim() 
    ? t`No fields match "${searchText}"`
    : t`No filterable fields available`;

  if (hasNoResults) {
    return (
      <div className={FilterSidesheetS.filterSidesheetContent}>
        <DelayGroup>
          <Stack gap="md" p="md">
            <TextInput
              placeholder={t`Search fields...`}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              leftSection={<Icon name="search" size={16} />}
              rightSection={
                searchText && (
                  <Icon 
                    name="close" 
                    size={16} 
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSearchText("")}
                  />
                )
              }
              mb="sm"
            />
            <Text ta="center" c="var(--mb-color-text-medium)">
              {emptyMessage}
            </Text>
          </Stack>
        </DelayGroup>
      </div>
    );
  }

  return (
    <div className={FilterSidesheetS.filterSidesheetContent}>
      <DelayGroup>
        <Stack gap="xs" p="md">
          <TextInput
            placeholder={t`Search fields...`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            leftSection={<Icon name="search" size={16} />}
            rightSection={
              searchText && (
                <Icon 
                  name="close" 
                  size={16} 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSearchText("")}
                />
              )
            }
            mb="sm"
          />
          {sections.map((section, sectionIndex) => (
            <Box key={sectionIndex}>
              {section.name && (
                <Box mb="sm">
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '8px 0',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: 'var(--mb-color-text-dark)'
                  }}>
                    {section.icon && <Icon name={section.icon} size={16} />}
                    {section.name}
                  </div>
                </Box>
              )}
              {section.items?.map((item, itemIndex) => {
                if (isSegmentListItem(item)) {
                  return (
                    <Box 
                      key={itemIndex}
                      p="sm"
                      style={{
                        border: '1px solid var(--mb-color-border)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      onClick={() => handleSegmentChange(item)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon name="star" size={18} />
                        <span>{item.displayName}</span>
                      </div>
                    </Box>
                  );
                }

                return (
                  <Box key={itemIndex} mb="24px">
                    <Box
                      style={{
                        border: '1px solid var(--mb-color-border)',
                        borderRadius: '6px',
                        backgroundColor: 'var(--mb-color-bg-white)',
                        padding: '16px',
                      }}
                    >
                      <Flex align="center" gap="md" wrap="wrap">
                        <Flex align="center" gap="xs" style={{ minWidth: '120px' }}>
                          <QueryColumnInfoIcon
                            query={query}
                            stageIndex={item.stageIndex}
                            column={item.column}
                            size={18}
                          />
                          <Text fw="500" size="sm">
                            {item.displayName}
                          </Text>
                        </Flex>
                        
                        <Box style={{ flex: 1, minWidth: '200px' }}>
                          <InlineFieldFilter
                            query={query}
                            stageIndex={item.stageIndex}
                            column={item.column}
                            onChange={handleFilterChange(item.column, item.stageIndex)}
                          />
                        </Box>
                      </Flex>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Stack>
      </DelayGroup>
    </div>
  );
}

function getSections({
  query,
  stageIndexes,
}: {
  query: Lib.Query;
  stageIndexes: number[];
}): Section[] {
  if (!query || !stageIndexes || stageIndexes.length === 0) {
    return [];
  }

  const withMultipleStages = stageIndexes.length > 1;
  const columnSections = stageIndexes.flatMap((stageIndex) => {
    try {
      const columns = Lib.filterableColumns(query, stageIndex);
      const columnGroups = Lib.groupColumns(columns);

      return columnGroups
        .filter((group) => {
          const groupInfo = Lib.displayInfo(query, stageIndex, group);
          // Filter out "Summaries" sections
          return groupInfo.displayName !== "Summaries" && 
                 !groupInfo.displayName?.includes("Summaries");
        })
        .map((group) => {
          const groupInfo = Lib.displayInfo(query, stageIndex, group);
          const columnItems = Lib.getColumnsFromColumnGroup(group).map((column) => {
            const columnInfo = Lib.displayInfo(query, stageIndex, column);
            return {
              name: columnInfo.name,
              displayName: columnInfo.displayName,
              filterPositions: columnInfo.filterPositions,
              column,
              query,
              stageIndex,
              combinedName: `${columnInfo.table?.name ?? ""} ${columnInfo.name}`,
              combinedDisplayName: `${columnInfo.table?.displayName ?? ""} ${columnInfo.displayName}`,
              longDisplayName: columnInfo.longDisplayName,
            };
          });
          const segments = groupInfo.isSourceTable
            ? Lib.availableSegments(query, stageIndex)
            : [];
          const segmentItems = segments.map((segment) => {
            const segmentInfo = Lib.displayInfo(query, stageIndex, segment);
            return {
              ...segmentInfo,
              segment,
              stageIndex,
            };
          });

          return {
            name: withMultipleStages
              ? getGroupName(groupInfo, stageIndex)
              : groupInfo.displayName,
            icon: getColumnGroupIcon(groupInfo),
            items: [...segmentItems, ...columnItems],
          };
        });
    } catch (error) {
      console.error(`Error processing stage ${stageIndex}:`, error);
      return [];
    }
  });

  return columnSections.filter(isNotNull);
} 