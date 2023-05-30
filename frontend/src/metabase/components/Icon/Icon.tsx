import React from "react";
import styled from "@emotion/styled";
import { space } from "styled-system";
import { color as c } from "metabase/lib/colors";

type IconWrapperProps = {
  open?: boolean;
  hover?: React.CSSProperties;
};

export const IconWrapper = styled.div<IconWrapperProps>`
  ${space};
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  cursor: pointer;
  color: ${props => (props.open ? c("brand") : "inherit")};
  // special cases for certain icons
  // Icon-share has a taller viewbox than most so to optically center
  // the icon we need to translate it upwards
  & > .icon.icon-share {
    transform: translateY(-2px);
  }

  &:hover {
    color: ${({ hover }) => hover?.color ?? c("brand")};
    background-color: ${({ hover }) =>
      hover?.backgroundColor ?? c("bg-medium")};
  }

  transition: all 300ms ease-in-out;

  @media (prefers-reduced-motion) {
    transition: none;
  }
`;
