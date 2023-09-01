import { isEmpty } from "underscore";
import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  SearchFilterComponentProps,
  SearchSidebarFilterComponent,
} from "metabase/search/types";
import { Box, Button, Group, Paper, Text } from "metabase/ui";
import type { IconName } from "metabase/core/components/Icon";
import { Icon } from "metabase/core/components/Icon";
import Popover from "metabase/components/Popover";
import {
  DropdownApplyButtonDivider,
  DropdownFilterElement,
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

  const dropdownRef = useRef<HTMLDivElement>(null);

  const fieldHasValue = !isEmpty(value);

  const [popoverWidth, setPopoverWidth] = useState("100%");

  useLayoutEffect(() => {
    if (dropdownRef.current) {
      setPopoverWidth(`${dropdownRef.current?.offsetWidth}px`);
    }
  }, []);

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
        hasBackground={false}
      >
        <Paper shadow="md" withBorder w={popoverWidth}>
          <Box p="md" w={popoverWidth}>
            <ContentComponent
              value={selectedValues}
              onChange={selected => setSelectedValues(selected)}
            />
          </Box>
          <DropdownApplyButtonDivider />
          <Group position="right" align="center" px="sm" pb="sm">
            <Button onClick={onApplyFilter}>Apply filters</Button>
          </Group>
        </Paper>
      </Popover>
    </div>
  );
};
