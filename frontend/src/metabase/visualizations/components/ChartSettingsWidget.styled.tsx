import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

type VariantProp = { variant?: "default" | "form-field" };

export const Root = styled.div<{
  disabled?: boolean;
  noPadding?: boolean;
  inline?: boolean;
  marginBottom?: string;
  borderBottom?: boolean;
}>``;

export const Title = styled.label<VariantProp>`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
  font-weight: 700;
  line-height: 0.875rem;

  ${props =>
    props.variant === "default" &&
    css`
      line-height: normal;
    `}
`;

export const Description = styled.span`
  margin-bottom: 0.5em;
`;

export const InfoIconContainer = styled.div`
  display: flex;
  margin-left: 0.5em;
`;

export const InfoIcon = styled(Icon)<VariantProp>`
  ${props =>
    props.variant === "form-field" &&
    css`
      color: var(--mb-color-bg-dark);

      &:hover {
        color: var(--mb-color-brand);
      }
    `}
`;
