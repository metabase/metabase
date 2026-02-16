// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const OptionsRoot = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  margin: auto 0.5rem;

  ${breakpointMinSmall} {
    margin-left: 4rem;
    margin-right: 4rem;
  }
`;

export const EducationalButton = styled(ExternalLink)`
  background-color: var(--mb-color-background-tertiary);
  border-radius: 0.5rem;
  color: var(--mb-color-brand);
  font-weight: bold;
  padding: 1em;
  transition: all 0.3s;

  &:hover {
    color: var(--mb-color-text-primary-inverse);
    background-color: var(--mb-color-brand);
  }
`;
