import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";

export const LinkFooter = styled.div`
  margin-top: 1rem;
`;

export const LinkButton = styled(Button)`
  color: var(--mb-color-brand);
  font-weight: normal;
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    text-decoration: underline;
    background-color: transparent;
  }
`;
