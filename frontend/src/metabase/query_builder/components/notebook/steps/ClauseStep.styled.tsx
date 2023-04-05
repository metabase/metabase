import styled from "@emotion/styled";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

export const ClauseStepPopover = styled(TippyPopoverWithTrigger)`
  .tippy-box,
  .tippy-content {
    display: flex;
  }
`;

ClauseStepPopover.defaultProps = {
  sizeToFit: true,
  disableContentSandbox: true,

  // Popover content is expected handle width on its own
  maxWidth: Infinity,
};
