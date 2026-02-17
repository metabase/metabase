// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Icon } from "metabase/ui";

const CardRootMixin = css`
  display: block;
  padding: 1.5rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.375rem;
  background-color: var(--mb-color-background-primary);
  box-shadow: 0 1px 6px var(--mb-color-shadow);
  box-sizing: border-box;
`;

const CardHeaderMixin = css`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
`;

export const CardRootStatic = styled.div`
  ${CardRootMixin};
`;

export const CardRootLink = styled(ExternalLink)`
  ${CardRootMixin};

  &:hover {
    background-color: var(--mb-color-background-secondary);
  }
`;

export const CardHeaderStatic = styled.div`
  ${CardHeaderMixin};
`;

export const CardHeaderLink = styled(ExternalLink)`
  ${CardHeaderMixin};
`;

export const CardTitle = styled.span`
  display: block;
  flex: 1 1 auto;
  color: var(--mb-color-brand);
  font-weight: bold;
  margin: 0 0.5rem;
`;

export const CardIcon = styled(Icon)`
  flex: 0 0 auto;
  color: var(--mb-color-brand);
`;

export const CardMessage = styled.div`
  display: block;
  color: var(--mb-color-text-secondary);
  line-height: 1.25rem;

  p {
    margin: 0;
  }

  p:not(:last-child) {
    margin-bottom: 1.25rem;
  }

  a {
    color: var(--mb-color-brand);
    cursor: pointer;
    font-weight: bold;
  }
`;
