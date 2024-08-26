import styled from "@emotion/styled";

import { CopyButton } from "metabase/components/CopyButton";

export const CopyWidgetButton = styled(CopyButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
  color: var(--mb-color-brand);
  outline: none;
  cursor: pointer;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;
