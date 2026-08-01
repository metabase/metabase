import cx from "classnames";
import type { KeyboardEvent } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { Box, Ellipsified, Icon, type IconProps } from "metabase/ui";

import S from "./ContentStudioTreeNode.module.css";

/** A row of a Content Studio sidebar tree. Rows without a `url` only expand. */
export type ContentStudioTreeNodeItem<TData = unknown> =
  ITreeNodeItem<TData> & {
    url?: string;
  };

type ContentStudioTreeNodeProps = Omit<TreeNodeProps<unknown>, "item"> & {
  item: ContentStudioTreeNodeItem;
};

export const ContentStudioTreeNode = forwardRef<
  HTMLLIElement,
  ContentStudioTreeNodeProps
>(function ContentStudioTreeNode(
  {
    item,
    depth,
    isExpanded,
    isSelected,
    hasChildren,
    onSelect,
    onToggleExpand,
    rightSection,
  },
  ref,
) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!hasChildren) {
        return;
      }
      if (event.key === "ArrowRight" && !isExpanded) {
        onToggleExpand();
      }
      if (event.key === "ArrowLeft" && isExpanded) {
        onToggleExpand();
      }
    },
    [hasChildren, isExpanded, onToggleExpand],
  );

  const iconProps: IconProps =
    typeof item.icon === "string" ? { name: item.icon } : item.icon;

  const label = (
    <>
      <Icon
        {...iconProps}
        size={16}
        className={cx(S.icon, { [S.tintedIcon]: iconProps.color == null })}
      />
      <Ellipsified className={S.name}>{item.name}</Ellipsified>
    </>
  );

  return (
    <Box
      component="li"
      ref={ref}
      role="treeitem"
      bdrs="sm"
      aria-selected={isSelected}
      aria-expanded={hasChildren ? isExpanded : undefined}
      className={cx(S.node, { [S.selected]: isSelected })}
      pl={`${depth * 0.75}rem`}
    >
      <button
        type="button"
        className={cx(S.expandToggle, {
          [S.expandToggleHidden]: !hasChildren,
        })}
        tabIndex={hasChildren ? 0 : -1}
        aria-label={isExpanded ? t`Collapse` : t`Expand`}
        onClick={onToggleExpand}
      >
        <Icon
          name="chevronright"
          size={12}
          className={cx(S.chevron, { [S.chevronExpanded]: isExpanded })}
        />
      </button>
      {item.url != null ? (
        <Link
          to={item.url}
          aria-label={item.name}
          className={S.link}
          onClick={onSelect}
          onKeyDown={handleKeyDown}
        >
          {label}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={item.name}
          className={S.link}
          onClick={onToggleExpand}
          onKeyDown={handleKeyDown}
        >
          {label}
        </button>
      )}
      {rightSection?.(item)}
    </Box>
  );
});
