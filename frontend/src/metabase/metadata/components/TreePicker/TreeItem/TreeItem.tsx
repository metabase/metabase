import cx from "classnames";
import type { HTMLAttributes } from "react";
import { Link } from "react-router";

import { Box, Flex, Icon, type IconName, Skeleton, rem } from "metabase/ui";

import S from "./TreeItem.module.css";

const ITEM_MIN_HEIGHT = 32; // items can vary in size because of text wrapping
const INDENT_OFFSET = 18;

type TreeItemProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  icon: IconName;
  href: string;
  level?: number;
  isActive?: boolean;
  isSelected?: boolean;
  isExpanded?: boolean;
  isExpandable?: boolean;
  isLoading?: boolean;
  isHidden?: boolean;
  isDisabled?: boolean;
};

export function TreeItem({
  className,
  label,
  icon,
  href,
  level = 0,
  isActive,
  isSelected,
  isExpanded,
  isExpandable,
  isLoading,
  isHidden,
  isDisabled,
  children,
  style,
  ...props
}: TreeItemProps) {
  return (
    <Flex
      component={Link}
      className={cx(
        S.item,
        {
          [S.active]: isActive,
          [S.selected]: isSelected,
          [S.expandable]: isExpandable,
          [S.disabled]: isDisabled,
        },
        className,
      )}
      style={{
        ...style,
        marginLeft: level * INDENT_OFFSET,
      }}
      to={href}
      align="center"
      justify="space-between"
      gap="sm"
      tabIndex={isDisabled ? -1 : 0}
      aria-selected={isActive}
      data-open={isExpanded}
      data-testid="tree-item"
      {...props}
    >
      <Flex align="center" mih={ITEM_MIN_HEIGHT} py="xs" w="100%">
        <Flex align="flex-start" gap="xs" w="100%">
          <Flex align="center" gap="xs">
            {isExpandable && (
              <Icon
                name="chevronright"
                size={10}
                color="var(--mb-color-text-light)"
                className={cx(S.chevron, {
                  [S.expanded]: isExpanded,
                })}
              />
            )}

            <Icon name={icon} className={S.icon} />
          </Flex>

          {isLoading ? (
            <TreeItemSkeleton />
          ) : (
            <Box
              className={S.label}
              c={isHidden && !isActive ? "text-secondary" : undefined}
              data-testid="tree-item-label"
              pl="sm"
            >
              {label}
            </Box>
          )}
        </Flex>
      </Flex>
      {children}
    </Flex>
  );
}

function TreeItemSkeleton() {
  const w = 20 + Math.random() * 80;

  return (
    <Skeleton
      data-testid="loading-placeholder"
      height={rem(12)}
      width={`${w}%`}
      radius="sm"
    />
  );
}
