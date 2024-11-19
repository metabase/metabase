import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const ShortcutButton = styled(Button)`
  transition: none;
  display: block;
  border: none;

  &:hover {
    color: var(--mb-color-text-brand);
    background: none;
  }
`;

export const Separator = styled.div`
  margin: 1rem;
  border-top: solid 1px var(--mb-color-text-light);
  opacity: 0.5;
`;
