// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import Link from "metabase/common/components/Link";

export const TextLink = styled(Link)`
  cursor: pointer;
  color: var(--mb-color-text-primary);

  &:hover {
    color: var(--mb-color-brand);
  }
`;

export const CardLink = styled(TextLink)`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.25rem;
  background-color: var(--mb-color-background-primary);
  box-shadow: 0 3px 10px var(--mb-color-shadow);
  border-radius: 6px;
`;

export const CardText = styled.span`
  font-weight: 700;
  line-height: 1rem;
`;
