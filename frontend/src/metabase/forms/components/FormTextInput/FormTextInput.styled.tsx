// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { CopyButton } from "metabase/common/components/CopyButton";

export const CopyWidgetButton = styled(CopyButton)`
  position: absolute;
  top: 0;
  bottom: 0;
  inset-inline-end: 0;
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-inline-start: 1px solid var(--mb-color-border);
  border-start-end-radius: 4px;
  border-end-end-radius: 4px;
  color: var(--mb-color-brand);
  outline: none;

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: var(--mb-color-brand);
  }
`;
