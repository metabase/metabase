import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";

export const GoogleButtonRoot = styled.div`
  display: flex;
  justify-content: center;
  flex-flow: column wrap;
  align-items: center;
`;

export const AuthError = styled.div`
  color: var(--mb-color-error);
  text-align: center;
`;

export const AuthErrorRoot = styled.div`
  margin-top: 1rem;
`;

export const TextLink = styled(Link)`
  cursor: pointer;
  color: var(--mb-color-text-dark);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
