import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const ActionsWrapper = styled.div`
  display: flex;
  flex-direction: row;
  gap: 0.5rem;

  margin: -0.5rem -0.5rem -0.5rem 0;
`;

export const ModalContentActionIcon = styled(Icon)`
  color: var(--mb-color-text-light);
  cursor: pointer;
  padding: 0.5rem;

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;

export const ModalHeaderBackIcon = styled(ModalContentActionIcon)`
  flex-shrink: 0;

  margin: -0.5rem 0 -0.5rem -0.5rem;

  :hover {
    color: var(--mb-color-brand);
  }
`;
