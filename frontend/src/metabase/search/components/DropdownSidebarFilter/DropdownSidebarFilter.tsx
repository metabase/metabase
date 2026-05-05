import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { isEmpty } from "underscore";

import { useCaptureEvent } from "metabase/common/hooks";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { useSelector } from "metabase/redux";
import type {
  FilterTypeKeys,
  SearchFilterComponentProps,
  SearchFilterDropdown,
  SearchFilterPropTypes,
} from "metabase/search/types";
import { getIsNavbarOpen } from "metabase/selectors/app";
import type { IconName } from "metabase/ui";
import { Box, Button, Center, Icon, Popover, Stack, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";

import {
  DropdownFieldSet,
  DropdownLabelIcon,
  GroupOverflowHidden,
  SearchEventSandbox,
} from "./DropdownSidebarFilter.styled";

export type DropdownSidebarFilterProps<T extends FilterTypeKeys = any> = {
  filter: SearchFilterDropdown<T>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
} & SearchFilterComponentProps<T>;

export const DropdownSidebarFilter = ({
  filter: { label, iconName, DisplayComponent, ContentComponent },
  "data-testid": dataTestId,
  value,
  onChange,
  isOpen: isPopoverOpen,
  onOpenChange,
}: DropdownSidebarFilterProps) => {
  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const isSmallScreen = useIsSmallScreen();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<string>();

  const fieldHasValue = Array.isArray(value)
    ? !isEmpty(value)
    : isNotNull(value);

  const handleResize = () => {
    if (dropdownRef.current) {
      const { width } = dropdownRef.current.getBoundingClientRect();
      setPopoverWidth(`${width}px`);
    }
  };

  useLayoutEffect(() => {
    if (!popoverWidth) {
      handleResize();
    }
    window.addEventListener("resize", handleResize, false);
    return () => window.removeEventListener("resize", handleResize, false);
  }, [dropdownRef, popoverWidth]);

  useLayoutEffect(() => {
    if (isNavbarOpen && isSmallScreen) {
      onOpenChange(false);
    }
  }, [isNavbarOpen, isSmallScreen, onOpenChange]);

  const onApplyFilter = (value: SearchFilterPropTypes) => {
    onChange(value);
    onOpenChange(false);
  };

  const onClearFilter = (e: MouseEvent) => {
    if (fieldHasValue) {
      e.stopPropagation();
      onChange(null);
      onOpenChange(false);
    }
  };

  const getDropdownIcon = (): IconName => {
    if (fieldHasValue) {
      return "close";
    } else {
      return isPopoverOpen ? "chevronup" : "chevrondown";
    }
  };

  useCaptureEvent(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onOpenChange(false);
      }
    },
    { enabled: isPopoverOpen },
  );

  return (
    <Popover
      opened={isPopoverOpen}
      onChange={onOpenChange}
      position="bottom-end"
    >
      <Popover.Target>
        <Box
          data-testid={dataTestId}
          ref={dropdownRef}
          onClick={() => onOpenChange(!isPopoverOpen)}
          w="100%"
          mt={fieldHasValue ? "0.25rem" : 0}
        >
          <DropdownFieldSet
            noPadding
            legend={fieldHasValue ? label() : undefined}
            fieldHasValueOrFocus={fieldHasValue}
          >
            <GroupOverflowHidden justify="space-between" wrap="nowrap" w="100%">
              {fieldHasValue ? (
                <DisplayComponent value={value} />
              ) : (
                <GroupOverflowHidden wrap="nowrap">
                  {iconName && <DropdownLabelIcon size={16} name={iconName} />}
                  <Text fw={700} truncate>
                    {label()}
                  </Text>
                </GroupOverflowHidden>
              )}
              <Button
                data-testid="sidebar-filter-dropdown-button"
                size="compact-xs"
                mr="0.25rem"
                c="inherit"
                variant="subtle"
                onClick={onClearFilter}
                leftSection={
                  <Center m="-0.25rem">
                    <Icon size={16} name={getDropdownIcon()} />
                  </Center>
                }
              />
            </GroupOverflowHidden>
          </DropdownFieldSet>
        </Box>
      </Popover.Target>

      <Popover.Dropdown data-testid="popover">
        <SearchEventSandbox>
          {popoverWidth && (
            <Stack mah="50vh">
              <ContentComponent
                value={value}
                onChange={(selected) => onApplyFilter(selected)}
                width={popoverWidth}
              />
            </Stack>
          )}
        </SearchEventSandbox>
      </Popover.Dropdown>
    </Popover>
  );
};
