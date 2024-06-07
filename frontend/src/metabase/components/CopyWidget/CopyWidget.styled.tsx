import styled from "@emotion/styled";

import { CopyButton } from "metabase/components/CopyButton";
import { color } from "metabase/lib/colors";

export const CopyWidgetButton = styled(CopyButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-left: 1px solid var(--mb-color-border);
  border-top-right-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
  color: var(--mb-color-brand);
  outline: none;

  &:hover {
    color: ${color("white")};
    background-color: var(--mb-color-brand);
  }
`;
