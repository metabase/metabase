import styled from "@emotion/styled";
import { css } from "@emotion/react";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";
import { Text, Icon } from "metabase/ui";
import Link from "metabase/core/components/Link";

export const BillingErrorMessage = styled.div`
  margin-top: 0.5rem;
  white-space: nowrap;
  color: ${color("error")};
`;

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

export const BillingInfoKey = styled(Text)`
  max-width: 15rem;
  color: ${color("text-md")};
`;

export const BillingInfoTextValue = styled(Text)`
  font-weight: bold;
  color: currentColor;
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
