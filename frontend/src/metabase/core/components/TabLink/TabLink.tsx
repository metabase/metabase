import type { MouseEvent } from "react";
import { useCallback, useContext } from "react";

import type { LinkProps } from "metabase/core/components/Link";

import { getTabId, getTabPanelId, TabContext } from "../Tab";

import { TabLinkRoot, TabLabel } from "./TabLink.styled";

export interface TabLinkProps<T> extends LinkProps {
  value?: T;
}

function TabLink<T>({ value, children, onClick, ...props }: TabLinkProps<T>) {
  const { value: selectedValue, idPrefix, onChange } = useContext(TabContext);
  const tabId = getTabId(idPrefix, value);
  const panelId = getTabPanelId(idPrefix, value);
  const isSelected = value === selectedValue;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      onChange?.(value);
    },
    [value, onClick, onChange],
  );

  return (
    <TabLinkRoot
      {...props}
      id={tabId}
      role="tab"
      isSelected={isSelected}
      aria-selected={isSelected}
      aria-controls={panelId}
      onClick={handleClick}
    >
      <TabLabel>{children}</TabLabel>
    </TabLinkRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(TabLink, {
  Root: TabLinkRoot,
});
