import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  AccordionList,
  type Section as BaseSection,
} from "metabase/common/components/AccordionList";
import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import { getColumnGroupIcon } from "metabase/common/utils/column-groups";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { ColorName } from "metabase/lib/colors/types";
import { isNotNull } from "metabase/lib/types";
import {
  type DefinedClauseName,
  clausesForMode,
  getClauseDefinition,
} from "metabase/querying/expressions";
import type { IconName } from "metabase/ui";
import { DelayGroup, Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import * as Lib from "metabase-lib";

import { BucketPickerPopover } from "./BucketPickerPopover";
import S from "./QueryColumnPicker.module.css";

const CUSTOM_EXPRESSION_SECTION_KEY = "custom-expression";

export type ColumnListItem = Lib.ColumnDisplayInfo & {
  type: "column";
  column: Lib.ColumnMetadata;
  combinedDisplayName?: string;
};

type ExpressionClauseItem = {
  type: "expression-clause";
  clause: DefinedClauseName;
  displayName: string;
};

type Item = ColumnListItem | ExpressionClauseItem;

export type QueryColumnPickerSection = BaseSection<Item>;

export interface QueryColumnPickerProps {
  className?: string;
  query: Lib.Query;
  stageIndex: number;
  columnGroups: Lib.ColumnGroup[];
  hasBinning?: boolean;
  hasTemporalBucketing?: boolean;
  withDefaultBucketing?: boolean;
  withInfoIcons?: boolean;
  maxHeight?: number;
  color?: ColorName;
  checkIsColumnSelected: (item: ColumnListItem) => boolean;
  onSelect: (column: Lib.ColumnMetadata) => void;
  onSelectSection?: (section: QueryColumnPickerSection) => void;
  /**
   * Set onSelectExpression to allow custom expressions to be selected
   */
  onSelectExpression?: (clause?: DefinedClauseName) => void;
  expressionSectionIcon?: IconName;
  onClose?: () => void;
  "data-testid"?: string;
  width?: string;
  hasInitialFocus?: boolean;
  alwaysExpanded?: boolean;
  disableSearch?: boolean;
  /** Hide section/group names (table names) in the picker */
  hideSectionNames?: boolean;
}

const SEARCH_PROP = [
  "name",
  "displayName",
  "combinedDisplayName",
  "longDisplayName",
] as const;

export function QueryColumnPicker({
  className,
  query,
  stageIndex,
  columnGroups,
  hasBinning = false,
  hasTemporalBucketing = false,
  withDefaultBucketing = true,
  withInfoIcons = false,
  color: colorProp = "brand",
  checkIsColumnSelected,
  onSelect,
  onSelectSection,
  onSelectExpression,
  expressionSectionIcon = "function",
  onClose,
  width,
  "data-testid": dataTestId,
  hasInitialFocus = true,
  alwaysExpanded,
  disableSearch,
  hideSectionNames = false,
}: QueryColumnPickerProps) {
  const tc = useTranslateContent();
  const withCustomExpressions = onSelectExpression != null;
  const [isSearching, setIsSearching] = useState(false);

  const sections: QueryColumnPickerSection[] = useMemo(() => {
    const columnSections = columnGroups.map((group) => {
      const groupInfo = Lib.displayInfo(query, stageIndex, group);

      const items = Lib.getColumnsFromColumnGroup(group).map((column) => {
        const columnInfo = Lib.displayInfo(
          query,
          stageIndex,
          getColumnWithoutBucketing(column, hasTemporalBucketing, hasBinning),
        );
        return {
          type: "column" as const,
          ...columnInfo,
          column,
          combinedDisplayName: `${tc(columnInfo.table?.displayName) ?? ""} ${tc(columnInfo.displayName)}`,
        };
      });

      return {
        name: hideSectionNames ? undefined : tc(groupInfo.displayName),
        icon: getColumnGroupIcon(groupInfo),
        items,
      };
    });

    const expressionClausesSection = {
      key: "expression-clauses",
      name: t`Custom Expressions`,
      icon: "function" as const,
      items: clausesForMode("expression").map((clause) => ({
        type: "expression-clause" as const,
        clause: clause.name,
        displayName: clause.displayName,
      })),
      alwaysSortLast: true,
    };
    const expressionClauseAction = {
      key: CUSTOM_EXPRESSION_SECTION_KEY,
      type: "action" as const,
      name: t`Custom Expression`,
      items: [],
      icon: expressionSectionIcon,
      alwaysSortLast: true,
    };

    return [
      ...columnSections,
      withCustomExpressions && isSearching ? expressionClausesSection : null,
      withCustomExpressions ? expressionClauseAction : null,
    ].filter(isNotNull);
  }, [
    query,
    stageIndex,
    columnGroups,
    hasTemporalBucketing,
    hasBinning,
    withCustomExpressions,
    expressionSectionIcon,
    isSearching,
    tc,
    hideSectionNames,
  ]);

  const handleSelectSection = useCallback(
    (section: QueryColumnPickerSection) => {
      if (section.key === CUSTOM_EXPRESSION_SECTION_KEY) {
        onSelectExpression?.();
      } else {
        onSelectSection?.(section);
      }
    },
    [onSelectExpression, onSelectSection],
  );

  const handleSelect = useCallback(
    (column: Lib.ColumnMetadata) => {
      onSelect(column);
      onClose?.();
    },
    [onSelect, onClose],
  );

  const handleSelectItem = useCallback(
    (item: Item) => {
      if (item.type === "column") {
        const isSameColumn = checkIsColumnSelected(item);

        if (isSameColumn) {
          onClose?.();
          return;
        }

        if (!withDefaultBucketing) {
          handleSelect(item.column);
          return;
        }

        const isBinnable = Lib.isBinnable(query, stageIndex, item.column);
        if (hasBinning && isBinnable) {
          handleSelect(Lib.withDefaultBinning(query, stageIndex, item.column));
          return;
        }

        const isTemporalBucketable = Lib.isTemporalBucketable(
          query,
          stageIndex,
          item.column,
        );
        if (hasTemporalBucketing && isTemporalBucketable) {
          handleSelect(
            Lib.withDefaultTemporalBucket(query, stageIndex, item.column),
          );
          return;
        }

        handleSelect(item.column);
      } else if (item.type === "expression-clause") {
        onSelectExpression?.(item.clause);
      }
    },
    [
      query,
      stageIndex,
      hasBinning,
      hasTemporalBucketing,
      withDefaultBucketing,
      checkIsColumnSelected,
      handleSelect,
      onSelectExpression,
      onClose,
    ],
  );

  const handleSearchTextChange = useCallback(
    (searchText: string) => {
      setIsSearching(searchText !== "");
      if (searchText.trim().endsWith("(")) {
        const name = searchText.trim().slice(0, -1);
        const clause = getClauseDefinition(name);
        if (clause) {
          onSelectExpression?.(clause.name);
        }
      }
    },
    [onSelectExpression],
  );

  const renderItemExtra = useCallback(
    (item: Item) => {
      if (item.type !== "column") {
        return null;
      }

      const isEditing = checkIsColumnSelected(item);

      return (
        (hasBinning || hasTemporalBucketing) && (
          <BucketPickerPopover
            classNames={{
              root: S.itemWrapper,
              /*
              isEditing controls "selected" state of the item, so if a row is selected, we want to show icon
              otherwise we show chevron down icon only when we hover over a row, to control this behavior
              we pass or not pass chevronDown class, which hides this icon by default
            */
              chevronDown: isEditing ? undefined : S.chevronDown,
            }}
            query={query}
            stageIndex={stageIndex}
            column={item.column}
            isEditing={isEditing}
            hasBinning={hasBinning}
            hasTemporalBucketing={hasTemporalBucketing}
            hasChevronDown={withInfoIcons}
            color={colorProp}
            onSelect={handleSelect}
          />
        )
      );
    },
    [
      query,
      stageIndex,
      checkIsColumnSelected,
      hasBinning,
      hasTemporalBucketing,
      withInfoIcons,
      colorProp,
      handleSelect,
    ],
  );

  const renderItemIcon = useCallback(
    (item: Item) =>
      item.type === "expression-clause" ? (
        <Icon name="function" />
      ) : (
        <QueryColumnInfoIcon
          query={query}
          stageIndex={stageIndex}
          column={item.column}
          position="top-start"
        />
      ),
    [query, stageIndex],
  );

  const itemIsSelected = useCallback(
    (item: Item) => item.type === "column" && checkIsColumnSelected(item),
    [checkIsColumnSelected],
  );

  const renderItemName = useCallback(
    (item: Item) => tc(item.displayName),
    [tc],
  );

  return (
    <DelayGroup>
      <AccordionList<Item, QueryColumnPickerSection>
        className={className}
        sections={sections}
        alwaysExpanded={alwaysExpanded}
        onChange={handleSelectItem}
        onChangeSection={handleSelectSection}
        onChangeSearchText={handleSearchTextChange}
        itemIsSelected={itemIsSelected}
        renderItemWrapper={renderItemWrapper}
        renderItemName={renderItemName}
        renderItemExtra={renderItemExtra}
        renderItemDescription={omitItemDescription}
        renderItemIcon={renderItemIcon}
        style={{
          color: color(colorProp),
        }}
        maxHeight={Infinity}
        data-testid={dataTestId}
        searchProp={SEARCH_PROP}
        // Compat with E2E tests around MLv1-based components
        // Prefer using a11y role selectors
        itemTestId="dimension-list-item"
        hasInitialFocus={hasInitialFocus}
        width={width}
        globalSearch={!disableSearch}
        searchable={!disableSearch}
      />
    </DelayGroup>
  );
}

// if there is a separate picker for temporal bucketing or binning,
// we do not want to include it in the column name
function getColumnWithoutBucketing(
  column: Lib.ColumnMetadata,
  hasTemporalBucketing: boolean,
  hasBinning: boolean,
) {
  if (hasTemporalBucketing && Lib.temporalBucket(column) != null) {
    return Lib.withTemporalBucket(column, null);
  }
  if (hasBinning && Lib.binning(column) != null) {
    return Lib.withBinning(column, null);
  }
  return column;
}

function renderItemWrapper(content: ReactNode) {
  return <HoverParent className={S.itemWrapper}>{content}</HoverParent>;
}

function omitItemDescription() {
  return null;
}
