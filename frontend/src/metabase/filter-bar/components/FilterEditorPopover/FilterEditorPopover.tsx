import type { ReactNode } from "react";

import { Popover } from "metabase/ui";

import { AnchorTarget, type GetAnchorRect } from "../AnchorTarget/AnchorTarget";

type FilterEditorPopoverProps = {
  getAnchorRect: GetAnchorRect;
  children: ReactNode;
  onClose: () => void;
};

export const FilterEditorPopover = ({
  getAnchorRect,
  children,
  onClose,
}: FilterEditorPopoverProps) => (
  <Popover opened position="bottom-start" onChange={onClose}>
    <Popover.Target>
      <AnchorTarget getRect={getAnchorRect} />
    </Popover.Target>
    <Popover.Dropdown>{children}</Popover.Dropdown>
  </Popover>
);
