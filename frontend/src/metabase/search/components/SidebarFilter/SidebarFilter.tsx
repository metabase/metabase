import { isEmpty } from "underscore";
import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";
import type {
  SearchFilterComponentProps,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import { Stack, Button, Group, Text } from "metabase/ui";
import type { IconName } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";
import Popover from "metabase/components/Popover";
import { useSelector } from "metabase/lib/redux";
import { getIsNavbarOpen } from "metabase/redux/app";
import useIsSmallScreen from "metabase/hooks/use-is-small-screen";
import {
  DropdownApplyButtonDivider,
  DropdownFilterElement,
  SearchPopoverContent,
} from "./SidebarFilter.styled";

export type SearchSidebarFilterProps = {
  filter: SearchSidebarFilterComponent;
} & SearchFilterComponentProps;

export const SidebarFilter = ({
  filter: { title, iconName, DisplayComponent, ContentComponent },
  "data-testid": dataTestId,
  value,
  onChange,
}: SearchSidebarFilterProps) => {
  const [selectedValues, setSelectedValues] = useState(value);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const isNavbarOpen = useSelector(getIsNavbarOpen);
  const isSmallScreen = useIsSmallScreen();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<string>();

  const fieldHasValue = !isEmpty(value);

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

  const onApplyFilter = () => {
    onChange(selectedValues);
    setIsPopoverOpen(false);
  };

  const onClearFilter = (e: MouseEvent) => {
    if (fieldHasValue) {
      e.stopPropagation();
      setSelectedValues(undefined);
      onChange(undefined);
      setIsPopoverOpen(false);
    }
  };

  const onPopoverClose = () => {
    // reset selection to the current filter state
    setSelectedValues(value);
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
    <div data-testid={dataTestId} ref={dropdownRef}>
      <div onClick={() => setIsPopoverOpen(!isPopoverOpen)}>
        <DropdownFilterElement
          noPadding
          fieldHasValueOrFocus={fieldHasValue}
          legend={fieldHasValue ? title : null}
        >
          <Group position="apart">
            {fieldHasValue ? (
              <DisplayComponent value={value} />
            ) : (
              <Group noWrap>
                <Icon name={iconName} />
                <Text weight={700}>{title}</Text>
              </Group>
            )}
            <Button
              style={{ pointerEvents: "all" }}
              data-testid="sidebar-filter-dropdown-button"
              compact
              c="inherit"
              variant="subtle"
              onClick={onClearFilter}
              leftIcon={<Icon name={getDropdownIcon()} />}
            />
          </Group>
        </DropdownFilterElement>
      </div>
      <Popover
        isOpen={isPopoverOpen}
        onClose={onPopoverClose}
        target={dropdownRef.current}
        ignoreTrigger
        autoWidth
      >
        <SearchPopoverContent w={popoverWidth ?? "100%"} spacing={0}>
          <Stack spacing="sm" h="100%" w="100%" style={{ overflow: "hidden" }}>
            <ContentComponent
              value={selectedValues}
              onChange={selected => setSelectedValues(selected)}
            />
          </Stack>
          <DropdownApplyButtonDivider />
          <Group position="right" align="center" px="sm" pb="sm">
            <Button onClick={onApplyFilter}>{t`Apply filters`}</Button>
          </Group>
        </SearchPopoverContent>
      </Popover>
    </div>
  );
};
