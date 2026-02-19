import type { MenuDropdownProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { useSequencedContentCloseHandler } from "metabase/common/hooks/use-sequenced-content-close-handler";
import { PreventEagerPortal } from "metabase/ui";

// hack to prevent parent TippyPopover from closing when selecting a Menu.Item
// remove when TippyPopover is no longer used
export function MenuDropdown({ children, ...props }: MenuDropdownProps) {
  return (
    <PreventEagerPortal {...props}>
      <Menu.Dropdown {...props} data-element-id="mantine-popover">
        <MenuDropdownContent>{children}</MenuDropdownContent>
      </Menu.Dropdown>
    </PreventEagerPortal>
  );
}

interface MenuDropdownContentProps {
  children?: ReactNode;
}

function MenuDropdownContent({ children }: MenuDropdownContentProps) {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler]);

  return <>{children}</>;
}
