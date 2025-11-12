// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Button from "metabase/common/components/Button";

export const PageRoot = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
`;

export const PageMain = styled.div`
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 7rem 0 2rem;
  max-width: 34.4rem;
`;

export const PageTitle = styled.h1`
  color: var(--mb-color-brand);
  font-size: 2.2rem;
  margin-top: 1.5rem;
`;

export const PageBody = styled.div`
  color: var(--mb-color-text-secondary);
  font-size: 1.286em;
  line-height: 1.457em;
  margin: 1rem 0;
  text-align: center;
`;

export const PageButton = styled(Button)`
  margin-top: 2rem;
`;
