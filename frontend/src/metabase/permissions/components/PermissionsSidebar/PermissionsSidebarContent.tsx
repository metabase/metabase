import cx from "classnames";
import { memo } from "react";

import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Text } from "metabase/ui";

import { EntityViewSwitch } from "../EntityViewSwitch";
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
  onEntityChange?: (entity: string) => void;
  entityViewFocus?: "database" | "group";
}

export const PermissionsSidebarContent = memo(
  function PermissionsSidebarContent({
    title,
    description,
    filterPlaceholder,
    entityGroups,
    entityViewFocus,
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
              <Icon name="arrow_left" mr="sm" c="text-disabled" />
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
              onChange={onEntityChange}
            />
          )}
        </Box>
        <FilterableTree
          placeholder={filterPlaceholder}
          onSelect={onSelect}
          itemGroups={entityGroups}
          selectedId={selectedId}
        />
      </>
    );
  },
);
