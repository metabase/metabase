import type { MouseEvent } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLatest } from "react-use";
import { isEmpty } from "underscore";

import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import type {
  FilterTypeKeys,
  SearchFilterComponentProps,
  SearchFilterDropdown,
  SearchFilterPropTypes,
} from "metabase/search/types";
import { getIsNavbarOpen } from "metabase/selectors/app";
import type { IconName } from "metabase/ui";
import { Box, Button, Center, Icon, Popover, Stack, Text } from "metabase/ui";

import {
  DropdownFieldSet,
  DropdownLabelIcon,
  GroupOverflowHidden,
  SearchEventSandbox,
} from "./DropdownSidebarFilter.styled";

export type DropdownSidebarFilterProps<T extends FilterTypeKeys = any> = {
  filter: SearchFilterDropdown<T>;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
} & SearchFilterComponentProps<T>;

export const DropdownSidebarFilter = ({
  filter: { label, iconName, DisplayComponent, ContentComponent },
  "data-testid": dataTestId,
  value,
  onChange,
  isOpen: controlledIsOpen,
  onOpenChange,
}: DropdownSidebarFilterProps) => {
  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(false);

  const isControlled = controlledIsOpen !== undefined;
  const isPopoverOpen = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  const onOpenChangeRef = useLatest(onOpenChange);

  const setIsPopoverOpen = useCallback(
    (open: boolean) => {
      if (isControlled) {
        onOpenChangeRef.current?.(open);
      } else {
        setUncontrolledIsOpen(open);
      }
    },
    [isControlled, onOpenChangeRef],
  );

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
      setIsPopoverOpen(false);
    }
  }, [isNavbarOpen, isSmallScreen, setIsPopoverOpen]);

  const onApplyFilter = (value: SearchFilterPropTypes) => {
    onChange(value);
    setIsPopoverOpen(false);
  };

  const onClearFilter = (e: MouseEvent) => {
    if (fieldHasValue) {
      e.stopPropagation();
      onChange(null);
      setIsPopoverOpen(false);
    }
  };

  const getDropdownIcon = (): IconName => {
    if (fieldHasValue) {
      return "close";
    } else {
      return isPopoverOpen ? "chevronup" : "chevrondown";
    }
  };

  return (
    <Popover
      opened={isPopoverOpen}
      onChange={setIsPopoverOpen}
      position="bottom-end"
    >
      <Popover.Target>
        <Box
          data-testid={dataTestId}
          ref={dropdownRef}
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
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

      <Popover.Dropdown>
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
