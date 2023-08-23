import type { ReactNode } from "react";
import { Icon } from "metabase/core/components/Icon";
import { Group, Text } from "metabase/ui";
import { SearchFilterSidebarItem } from "metabase/search/components/SearchFilterSidebar/filters/SearchFilterView.styled";
import Popover from "metabase/components/Popover";
import { useLayoutEffect, useRef, useState } from "react";

export const SearchFilterView = ({
  title,
  tooltip,
  isLoading,
  "data-testid": dataTestId,
  children,
}: {
  title: string;
  tooltip?: string;
  isLoading?: boolean;
  "data-testid"?: string;
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const ref = useRef(null);

  const [refWidthValue, setRefWidthValue] = useState(null)

  useLayoutEffect(() => {
    setRefWidthValue(ref.current?.offsetWidth);
  }, []);

  return (
    <div style={{ width: "clamp(10rem, 100%, 17.5rem)" }}>
      <SearchFilterSidebarItem
        py="12px"
        px="16px"
        w="clamp(10rem, 100%, 17.5rem)"
        justify="space-between"
        align="center"
        onClick={() => setIsOpen(true)}
        ref={ref}
      >
        <Group noWrap>
          <Icon name="dashboard" />
          <Text truncate="end" fw={700}>
            {title}
          </Text>
        </Group>
        <Icon name="chevrondown" />
      </SearchFilterSidebarItem>
      <Popover
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        target={ref.current}
      >
        <div
          style={{ width: refWidthValue ? `${refWidthValue}px` : "100%" }}
        >
          {children}
        </div>
      </Popover>
    </div>
  );
};
