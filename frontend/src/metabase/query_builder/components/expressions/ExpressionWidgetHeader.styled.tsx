import styled from "@emotion/styled";

import Button from "metabase/core/components/Button/Button";

export const Header = styled.div`
  color: var(--mb-color-text-medium);
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--mb-color-border);

  display: flex;
  align-items: center;
`;

export const HeaderButton = styled(Button)`
  color: var(--mb-color-text-light);
`;
