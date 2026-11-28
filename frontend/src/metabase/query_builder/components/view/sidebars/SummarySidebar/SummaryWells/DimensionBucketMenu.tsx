import { type MouseEvent, type ReactNode, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryBucketOption, SummaryDimensionItem } from "../types";

import { useWellFieldRef } from "./SummaryWell";

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
  const [expandedBy, setExpandedBy] = useState<"keyboard" | "pointer" | null>(
    null,
  );
  const wellFieldRef = useWellFieldRef();
  const isExpanded = expandedBy !== null;
  const selectedIndex = bucketOptions.findIndex((option) => option.isSelected);
  // the trailing "Don't bin" doesn't expand the list on its own
  const isHiddenBucketSelected =
    selectedIndex >= initialBucketOptionCount &&
    selectedIndex < bucketOptions.length - 1;
  const showMoreButton =
    bucketOptions.length > initialBucketOptionCount &&
    !isExpanded &&
    !isHiddenBucketSelected;
  const visibleOptions = showMoreButton
    ? bucketOptions.slice(0, initialBucketOptionCount)
    : bucketOptions;

  const handleSelect = (
    option: SummaryBucketOption,
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const isKeyboardClick = event.detail === 0;
    onSelect(option);
    if (isKeyboardClick) {
      wellFieldRef?.current?.focus();
    }
  };

  const handleMoreClick = (event: MouseEvent<HTMLButtonElement>) => {
    const isKeyboardClick = event.detail === 0;
    setExpandedBy(isKeyboardClick ? "keyboard" : "pointer");
  };

  return (
    <Menu position="bottom-start" onClose={() => setExpandedBy(null)}>
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
      <Menu.Dropdown style={{ overflowY: "auto" }}>
        {visibleOptions.map((option, index) => (
          <Menu.Item
            key={option.displayName}
            autoFocus={
              expandedBy === "keyboard" && index === initialBucketOptionCount
            }
            rightSection={
              option.isSelected ? <Icon name="check" aria-hidden /> : null
            }
            onClick={(event) => handleSelect(option, event)}
          >
            {option.displayName}
          </Menu.Item>
        ))}
        {showMoreButton && (
          <Menu.Item
            c="core-brand"
            closeMenuOnClick={false}
            onClick={handleMoreClick}
          >
            {t`More…`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
