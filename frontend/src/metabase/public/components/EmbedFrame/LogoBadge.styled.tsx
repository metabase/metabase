import { css } from "@emotion/react";
import styled from "@emotion/styled";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { breakpointMinMedium } from "metabase/styled-components/theme";

export type Variant = "default" | "large";

export const MetabaseLink = styled(ExternalLink)<{ variant: Variant }>`
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: bold;
  text-decoration: none;

  ${props =>
    props.variant === "large" &&
    css`
      flex-direction: column;
    `}
`;

const messageVariantStyles = {
  default: css`
    color: ${color("text-medium")};
    margin-left: 0.5rem;
    ${breakpointMinMedium} {
      margin-left: 1rem;
    }
  `,
  large: css`
    color: ${color("text-dark")};
    margin-top: 1rem;
  `,
};

export const Message = styled.span<{ variant: Variant }>`
  ${props => messageVariantStyles[props.variant]}
`;

export const MetabaseName = styled.span<{ isDark: boolean; variant: Variant }>`
  color: ${props => {
    if (props.isDark) {
      return color("white");
    }
    return color(props.variant === "large" ? "text-dark" : "brand");
  }};
`;
