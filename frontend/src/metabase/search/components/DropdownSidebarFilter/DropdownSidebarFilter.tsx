/* eslint-disable react/prop-types */
import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { isEmpty } from "underscore";

import Popover from "metabase/components/Popover";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
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
import { Text, Box, Center, Button, Stack, Icon } from "metabase/ui";

import {
  GroupOverflowHidden,
  DropdownFieldSet,
  DropdownLabelIcon,
  SearchEventSandbox,
} from "./DropdownSidebarFilter.styled";

export type DropdownSidebarFilterProps<T extends FilterTypeKeys = any> = {
  filter: SearchFilterDropdown<T>;
} & SearchFilterComponentProps<T>;

export const DropdownSidebarFilter = ({
  filter: { label, iconName, DisplayComponent, ContentComponent },
  "data-testid": dataTestId,
  value,
  onChange,
}: DropdownSidebarFilterProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

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
  }, [isNavbarOpen, isSmallScreen]);

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

  const onPopoverClose = () => {
    setIsPopoverOpen(false);
  };

  const getDropdownIcon = (): IconName => {
    if (fieldHasValue) {
      return "close";
    } else {
      return isPopoverOpen ? "chevronup" : "chevrondown";
    }
  };

  return (
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
        <GroupOverflowHidden position="apart" noWrap w="100%">
          {fieldHasValue ? (
            <DisplayComponent value={value} />
          ) : (
            <GroupOverflowHidden noWrap>
              {iconName && <DropdownLabelIcon size={16} name={iconName} />}
              <Text weight={700} truncate>
                {label()}
              </Text>
            </GroupOverflowHidden>
          )}
          <Button
            data-testid="sidebar-filter-dropdown-button"
            compact
            mr="0.25rem"
            size="xs"
            c="inherit"
            variant="subtle"
            onClick={onClearFilter}
            leftIcon={
              <Center m="-0.25rem">
                <Icon size={16} name={getDropdownIcon()} />
              </Center>
            }
          />
        </GroupOverflowHidden>
      </DropdownFieldSet>

      <Popover
        isOpen={isPopoverOpen}
        onClose={onPopoverClose}
        target={dropdownRef.current}
        ignoreTrigger
        autoWidth
        sizeToFit
        pinInitialAttachment
        horizontalAttachments={["right"]}
      >
        {({ maxHeight }: { maxHeight: number }) =>
          popoverWidth && (
            <SearchEventSandbox>
              {popoverWidth && (
                <Stack mah={maxHeight}>
                  <ContentComponent
                    value={value}
                    onChange={selected => onApplyFilter(selected)}
                    width={popoverWidth}
                  />
                </Stack>
              )}
            </SearchEventSandbox>
          )
        }
      </Popover>
    </Box>
  );
};
