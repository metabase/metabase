// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const ActionsWrapper = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
`;

export const ModalContentActionIcon = styled(Icon)`
  color: var(--mb-color-text-tertiary);
  cursor: pointer;

  &:hover {
    color: var(--mb-color-text-secondary);
  }
`;

export const ModalHeaderBackIcon = styled(ModalContentActionIcon)`
  flex-shrink: 0;

  :hover {
    color: var(--mb-color-brand);
  }
`;
