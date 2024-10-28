import styled from "@emotion/styled";

import TippyPopover from "metabase/components/Popover/TippyPopover";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.5rem 1rem;
  font-weight: 700;
`;

export const FlexTippyPopover = styled(TippyPopover)`
  display: flex;
  max-height: 80vh;
  box-sizing: border-box;

  &.tippy-box {
    border: none;
  }
`;
export const Divider = styled.div`
  height: 1px;
  background-color: var(--mb-color-border);
  margin: 0.5rem -1.5rem 0.5rem;
`;
