import { type ReactNode, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryBucketOption, SummaryDimensionItem } from "../types";

type DimensionBucketMenuProps = {
  item: SummaryDimensionItem;
  /** The selected bucket, shown before the chevron. */
  children?: ReactNode;
  onSelect: (option: SummaryBucketOption) => void;
};

export function DimensionBucketMenu({
  item,
  children,
  onSelect,
}: DimensionBucketMenuProps) {
  const { bucketOptions, initialBucketOptionCount } = item;
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedIndex = bucketOptions.findIndex((option) => option.isSelected);
  // the trailing "Don't bin" doesn't expand the list on its own
  const isHiddenBucketSelected =
    selectedIndex >= initialBucketOptionCount &&
    selectedIndex < bucketOptions.length - 1;
  const hasMoreButton =
    bucketOptions.length > initialBucketOptionCount &&
    !isExpanded &&
    !isHiddenBucketSelected;
  const visibleOptions = hasMoreButton
    ? bucketOptions.slice(0, initialBucketOptionCount)
    : bucketOptions;

  return (
    <Menu position="bottom-start" onClose={() => setIsExpanded(false)}>
      <Menu.Target>
        <ActionIcon
          className={S.chipBucketButton}
          classNames={{ icon: S.chipBucketContent }}
          size="sm"
          variant="subtle"
          c="inherit"
          aria-label={t`Change how ${item.label} is grouped`}
        >
          {children}
          <Icon name="chevrondown" size={10} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {visibleOptions.map((option) => (
          <Menu.Item
            key={option.displayName}
            rightSection={
              option.isSelected ? <Icon name="check" aria-hidden /> : null
            }
            onClick={() => onSelect(option)}
          >
            {option.displayName}
          </Menu.Item>
        ))}
        {hasMoreButton && (
          <Menu.Item
            c="core-brand"
            closeMenuOnClick={false}
            onClick={() => setIsExpanded(true)}
          >
            {t`More…`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
