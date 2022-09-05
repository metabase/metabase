import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Icon, { IconProps } from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

type VariantProp = { variant?: "default" | "form-field" };

export const Root = styled.div<{
  disabled?: boolean;
  noPadding?: boolean;
  inline?: boolean;
  marginBottom?: string;
}>`
  ${props =>
    !props.noPadding &&
    css`
      margin-left: 2rem;
      margin-right: 2rem;
    `}

  ${props =>
    props.hidden &&
    css`
      display: none;
    `}

  ${props =>
    !props.hidden &&
    css`
      margin-bottom: ${props.marginBottom || "1.5em"};
    `}

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `}
  ${props =>
    props.inline &&
    css`
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;

      ${Title} {
        display: inline-flex;
        margin-bottom: 0;
      }
    `}

  input, .AdminSelect {
    transition: border 0.3s;

    &:hover {
      transition: border 0.3s;
      border-color: ${() => color("brand")};
    }
  }
`;

export const Title = styled.label<VariantProp>`
  display: flex;
  align-items: center;
  margin-bottom: 1rem;

  ${props =>
    props.variant === "default" &&
    css`
      font-weight: 700;
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
      color: ${color("bg-dark")};

      &:hover {
        color: ${color("brand")};
      }
    `}
`;
