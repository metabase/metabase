import { useState } from "react";
import { t } from "ttag";

import { Ellipsified, Icon, Menu, UnstyledButton } from "metabase/ui";

import S from "../SummarySidebar.module.css";
import type { SummaryBucketOption, SummaryDimensionItem } from "../types";

type DimensionBucketMenuProps = {
  item: SummaryDimensionItem;
  onSelect: (option: SummaryBucketOption) => void;
};

export function DimensionBucketMenu({
  item,
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
        <UnstyledButton
          className={S.chipButton}
          aria-label={t`Change how ${item.label} is grouped`}
        >
          <Ellipsified fw="inherit">{item.label}</Ellipsified>
          <Icon name="chevrondown" size={10} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {visibleOptions.map((option) => (
          <Menu.Item
            key={option.displayName}
            rightSection={
              option.isSelected ? <Icon name="check" aria-hidden /> : null
            }
            onClick={() => {
              if (!option.isSelected) {
                onSelect(option);
              }
            }}
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
