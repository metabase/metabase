import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Icon, { IconProps } from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

type VariantProp = { variant?: "default" | "form-field" };

export const Root = styled.div<{
  disabled?: boolean;
  noPadding?: boolean;
}>`
  ${props =>
    !props.noPadding &&
    css`
      margin-left: 2em;
      margin-right: 2em;
    `}

  ${props =>
    props.hidden &&
    css`
      display: none;
    `}

  ${props =>
    !props.hidden &&
    css`
      margin-bottom: 1.5em;
    `}

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
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
  margin-bottom: 0.5em;

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
