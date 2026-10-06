import cx from "classnames";
import type { MouseEvent } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { isEmpty } from "underscore";

import { EventSandbox } from "metabase/common/components/EventSandbox";
import { FieldSet } from "metabase/common/components/FieldSet";
import { useCaptureEvent } from "metabase/common/hooks";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import type {
  FilterTypeKeys,
  SearchFilterComponentProps,
  SearchFilterDropdown,
  SearchFilterPropTypes,
} from "metabase/common/search/types";
import { useSelector } from "metabase/redux";
import { getIsNavbarOpen } from "metabase/selectors/app";
import { Box, Button, Group, Icon, Popover, Stack, Text } from "metabase/ui";
import { isNotNull } from "metabase/utils/types";
import type { IconName } from "metabase-types/api";

import S from "./DropdownSidebarFilter.module.css";

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
          <FieldSet
            className={cx(S.dropdownFieldSet, { [S.hasValue]: fieldHasValue })}
            noPadding
            legend={fieldHasValue ? label() : undefined}
          >
            <Group
              className={S.overflowHidden}
              justify="space-between"
              wrap="nowrap"
              w="100%"
            >
              {fieldHasValue ? (
                <DisplayComponent value={value} />
              ) : (
                <Group className={S.overflowHidden} wrap="nowrap">
                  {iconName && (
                    <Icon className={S.labelIcon} size={16} name={iconName} />
                  )}
                  <Text fw={700} truncate>
                    {label()}
                  </Text>
                </Group>
              )}
              {/* TODO: replace with ActionIcon (GDGT-2457) */}
              <Button
                variant="subtle"
                color="neutral"
                size="sm"
                data-testid="sidebar-filter-dropdown-button"
                onClick={onClearFilter}
                leftSection={<Icon name={getDropdownIcon()} />}
              />
            </Group>
          </FieldSet>
        </Box>
      </Popover.Target>

      <Popover.Dropdown data-testid="popover">
        <EventSandbox className={S.eventSandbox}>
          {popoverWidth && (
            <Stack mah="50vh">
              <ContentComponent
                value={value}
                onChange={(selected) => onApplyFilter(selected)}
                width={popoverWidth}
              />
            </Stack>
          )}
        </EventSandbox>
      </Popover.Dropdown>
    </Popover>
  );
};
