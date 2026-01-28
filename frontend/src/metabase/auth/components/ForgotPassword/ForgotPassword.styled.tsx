// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Link } from "metabase/common/components/Link";
import { Icon } from "metabase/ui";

export const InfoBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const InfoIcon = styled(Icon)`
  display: block;
  color: var(--mb-color-brand);
  width: 1.5rem;
  height: 1.5rem;
`;

export const InfoIconContainer = styled.div`
  padding: 1.25rem;
  border-radius: 50%;
  background-color: var(--mb-color-brand-light);
  margin-bottom: 1.5rem;
`;

export const InfoMessage = styled.div`
  color: var(--mb-color-text-primary);
  text-align: center;
  margin-bottom: 1rem;
`;

export const InfoLink = styled(Link)`
  color: var(--mb-color-text-primary);
  margin-top: 2.5rem;

  &:hover {
    color: var(--mb-color-brand);
  }
`;
