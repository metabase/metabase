import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Card } from "metabase/common/components/Card";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";

export const BillingInfoCard = styled(Card)`
  margin-top: 1rem;
`;

export const BillingInfoRowContainer = styled.div<{ extraPadding?: boolean }>`
  display: flex;
  justify-content: space-between;
  padding: ${({ extraPadding }) => (extraPadding ? `1.5rem` : `0.5rem`)} 1rem;
  align-items: center;

  &:not(:last-child) {
    border-bottom: 1px solid var(--mb-color-background-tertiary);
  }
`;

const linkStyles = css`
  display: inline-flex;
  align-items: center;
  color: var(--mb-color-brand);
`;

export const BillingInternalLink = styled(Link)(linkStyles);

export const BillingExternalLink = styled(ExternalLink)(linkStyles);
