import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const BillingInfoCard = styled(Card)`
  margin-top: 1rem;
`;

export const BillingInfoRowContainer = styled.div<{ extraPadding?: boolean }>`
  display: flex;
  justify-content: space-between;
  padding: ${({ extraPadding }) => (extraPadding ? `1.5rem` : `0.5rem`)} 1rem;
  align-items: center;

  &:not(:last-child) {
    border-bottom: 1px solid ${color("bg-medium")};
  }
`;

const linkStyles = css`
  display: inline-flex;
  align-items: center;
  color: ${color("brand")};
`;

export const BillingInternalLink = styled(Link)(linkStyles);

export const BillingExternalLink = styled(ExternalLink)(linkStyles);

export const BillingExternalLinkIcon = styled(Icon)`
  margin-left: 0.25rem;
`;

export const StoreButtonLink = styled(ExternalLink)`
  display: inline-flex;
  background-color: ${color("brand")};
  color: ${color("text-white")};
  align-items: center;
  font-weight: bold;
  padding: 0.75rem 1rem;
  margin-top: 1rem;
  border-radius: 6px;

  &:hover {
    opacity: 0.88;
    transition: all 200ms linear;
  }
`;
