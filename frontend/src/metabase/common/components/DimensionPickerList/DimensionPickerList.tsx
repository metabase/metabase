import type { ReactNode } from "react";

import type { ListSection } from "metabase/common/components/DimensionPill/utils";
import { Box, NavLink, Stack, Text } from "metabase/ui";

import S from "./DimensionPickerList.module.css";

interface DimensionPickerListProps<TItem> {
  sections: ListSection<TItem>[];
  onChange: (item: TItem) => void;
  renderItemName: (item: TItem) => string | undefined;
  renderItemIcon?: (item: TItem) => ReactNode;
  renderItemExtra?: (item: TItem, isSelected: boolean) => ReactNode;
  renderItemWrapper?: (content: ReactNode, item: TItem) => ReactNode;
  itemIsSelected?: (item: TItem) => boolean;
  className?: string;
  w?: string | number;
}

export function DimensionPickerList<TItem>({
  sections,
  onChange,
  renderItemName,
  renderItemIcon,
  renderItemExtra,
  renderItemWrapper,
  itemIsSelected,
  className,
  w,
}: DimensionPickerListProps<TItem>) {
  const showSectionHeaders =
    sections.length > 1 && sections.some((s) => s.name);

  return (
    <Box role="listbox" className={`${S.root} ${className ?? ""}`} w={w}>
      {sections.map((section, sectionIndex) => (
        <Box key={section.name ?? sectionIndex}>
          {showSectionHeaders && section.name && (
            <Text
              size="xs"
              tt="uppercase"
              fw={700}
              c="brand"
              px="md"
              pt="md"
              pb="sm"
            >
              {section.name}
            </Text>
          )}
          <Stack gap="xs">
            {section.items?.map((item, itemIndex) => {
              const isSelected = itemIsSelected?.(item) ?? false;
              const navLink = (
                <NavLink
                  variant="default"
                  role="option"
                  aria-selected={isSelected}
                  active={isSelected}
                  label={renderItemName(item)}
                  leftSection={renderItemIcon?.(item)}
                  rightSection={renderItemExtra?.(item, isSelected)}
                  onClick={() => onChange(item)}
                />
              );
              return (
                <Box key={itemIndex} mx="sm">
                  {renderItemWrapper
                    ? renderItemWrapper(navLink, item)
                    : navLink}
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}
    </Box>
  );
}
