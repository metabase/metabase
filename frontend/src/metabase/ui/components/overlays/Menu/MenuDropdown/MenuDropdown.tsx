import type { MenuDropdownProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import type { ReactNode } from "react";
import { useEffect } from "react";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

// hack to prevent parent TippyPopover from closing when selecting a Menu.Item
// remove when TippyPopover is no longer used
export function MenuDropdown({ children, ...props }: MenuDropdownProps) {
  return (
    <Menu.Dropdown {...props}>
      <MenuDropdownContent>{children}</MenuDropdownContent>
    </Menu.Dropdown>
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
