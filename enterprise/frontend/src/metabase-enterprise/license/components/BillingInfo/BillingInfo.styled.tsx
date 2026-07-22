import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Card } from "metabase/common/components/Card";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";

export const BillingInfoCard = styled(Card)`
  margin-top: 1rem;
`;

export const BillingInfoRowContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 1.5rem;

  &:not(:last-child) {
    border-bottom: 1px solid var(--mb-color-background-tertiary);
  }
`;

const linkStyles = css`
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  color: var(--mb-color-brand);
`;

export const BillingInternalLink = styled(Link)(linkStyles);

export const BillingExternalLink = styled(ExternalLink)(linkStyles);
