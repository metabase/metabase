import styled from "@emotion/styled";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import Card from "metabase/components/Card";
import { Text, Icon } from "metabase/ui";

export const BillingErrorMessage = styled.div`
  margin-top: 0.5rem;
  white-space: nowrap;
  color: ${color("error")};
`;

export const BillingInfoCard = styled(Card)`
  margin-top: 1rem;
`;

export const BillingInfoRow = styled.div<{ extraPadding?: boolean }>`
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

export const BillingInfoPrimitiveValue = styled(Text)<{
  type: "string" | "number";
}>`
  color: ${({ type }) =>
    type === "string" ? color("text-md") : color("brand")};
  font-weight: bold;
`;

export const BillingExternalLink = styled(ExternalLink)`
  display: inline-flex;
  align-items: center;
  font-weight: bold;
  color: ${color("brand")};
`;

export const BillingExternalLinkIcon = styled(Icon)`
  margin-left: 0.25rem;
`;
