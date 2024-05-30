import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const EditGroupButton = styled.li`
  cursor: pointer;
  padding: 0.5rem 1rem;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;

export const DeleteModalTrigger = styled.li`
  color: var(--mb-color-error);
  cursor: pointer;
  padding: 0.5rem 1rem;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;
