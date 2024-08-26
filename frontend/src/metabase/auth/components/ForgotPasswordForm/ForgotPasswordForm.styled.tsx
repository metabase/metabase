import styled from "@emotion/styled";

import Link from "metabase/core/components/Link/Link";

export const PasswordFormTitle = styled.div`
  color: var(--mb-color-text-dark);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
  margin-bottom: 1.5rem;
`;

export const PasswordFormFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 1.5rem;
`;

export const PasswordFormLink = styled(Link)`
  color: var(--mb-color-text-dark);

  &:hover {
    color: var(--mb-color-brand);
  }
`;
