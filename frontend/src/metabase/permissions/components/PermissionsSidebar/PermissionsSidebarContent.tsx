import cx from "classnames";
import { type ReactNode, memo } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Text } from "metabase/ui";

import { type EntityView, EntityViewSwitch } from "../EntityViewSwitch";
import { FilterableTree } from "../FilterableTree";

import S from "./PermissionsSidebarContent.module.css";

export interface PermissionsSidebarContentProps {
  title?: string;
  description?: string;
  filterPlaceholder: string;
  onSelect: (item: ITreeNodeItem) => void;
  onBack?: () => void;
  selectedId?: ITreeNodeItem["id"];
  entityGroups: ITreeNodeItem[][];
  /** A heading per entity group, shown in place of the dividers. */
  entityGroupTitles?: (string | undefined)[];
  rightSection?: (item: ITreeNodeItem) => ReactNode;
  /** What the search matches, the name by default. */
  getSearchText?: (item: ITreeNodeItem) => string;
  onEntityChange?: (entity: EntityView) => void;
  entityViewFocus?: EntityView;
  entityViews?: EntityView[];
  /** Shown between the view switch and the searchable list. */
  headerContent?: ReactNode;
}

export const PermissionsSidebarContent = memo(
  function PermissionsSidebarContent({
    title,
    description,
    filterPlaceholder,
    entityGroups,
    entityGroupTitles,
    rightSection,
    getSearchText,
    entityViewFocus,
    entityViews,
    headerContent,
    selectedId,
    onEntityChange,
    onSelect,
    onBack,
  }: PermissionsSidebarContentProps) {
    return (
      <>
        <Box pt="md" px="xl" flex="0 0 auto">
          {onBack ? (
            <Flex
              component="button"
              className={cx(S.backButton, CS.cursorPointer)}
              align="center"
              fz="md"
              fw={700}
              py="sm"
              ta="left"
              onClick={onBack}
            >
              <Icon name="arrow_left" mr="sm" c="text-secondary" />
              {title}
            </Flex>
          ) : (
            <div className={S.SidebarContentTitle}>{title}</div>
          )}
          {description && (
            <Text lh="normal" c="text-primary">
              {description}
            </Text>
          )}
          {entityViewFocus && onEntityChange && (
            <EntityViewSwitch
              value={entityViewFocus}
              views={entityViews}
              onChange={onEntityChange}
            />
          )}
          {headerContent}
        </Box>
        <FilterableTree
          placeholder={filterPlaceholder}
          onSelect={onSelect}
          itemGroups={entityGroups}
          itemGroupTitles={entityGroupTitles}
          rightSection={rightSection}
          getSearchText={getSearchText}
          selectedId={selectedId}
        />
      </>
    );
  },
);
