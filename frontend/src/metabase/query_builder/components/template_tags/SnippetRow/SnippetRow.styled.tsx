import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const SnippetButton = styled(Button)`
  color: var(--mb-color-brand);
  background-color: var(--mb-color-bg-light);
  margin-top: 0.5rem;

  &:hover {
    color: var(--mb-color-text-white);
    background-color: var(--mb-color-brand);
  }
`;

export const SnippetContent = styled.div`
  display: flex;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
