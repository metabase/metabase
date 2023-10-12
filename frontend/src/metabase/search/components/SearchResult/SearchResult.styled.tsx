import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { HTMLAttributes } from "react";
import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Link from "metabase/core/components/Link";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import type { BoxProps, TextProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

interface ResultStylesProps {
  compact: boolean;
  active: boolean;
  isSelected: boolean;
}

export const TitleWrapper = styled.div`
  display: flex;
  grid-gap: 0.25rem;
  align-items: center;
`;

export const Title = styled("h3")<{ active: boolean }>`
  margin-bottom: 4px;
  color: ${props => color(props.active ? "text-dark" : "text-medium")};
`;

export const ResultButton = styled.button<ResultStylesProps>`
  ${props => resultStyles(props)}
  padding-right: 0.5rem;
  text-align: left;
  cursor: pointer;
  width: 100%;

  &:hover {
    ${Title} {
      color: ${color("brand")};
    }
  }
`;

export const ResultLink = styled(Link)<ResultStylesProps>`
  ${props => resultStyles(props)}
`;

const resultStyles = ({ compact, active, isSelected }: ResultStylesProps) => `
  display: block;
  background-color: ${isSelected ? lighten("brand", 0.63) : "transparent"};
  min-height: ${compact ? "36px" : "54px"};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
  padding-left: 14px;
  padding-right: ${compact ? "20px" : space(3)};
  cursor: ${active ? "pointer" : "default"};

  &:hover {
    background-color: ${active ? lighten("brand", 0.63) : ""};

    h3 {
      color: ${active || isSelected ? color("brand") : ""};
    }
  }

  ${Link.Root} {
    text-underline-position: under;
    text-decoration: underline ${color("text-light")};
    text-decoration-style: dashed;

    &:hover {
      color: ${active ? color("brand") : ""};
      text-decoration-color: ${active ? color("brand") : ""};
    }
  }

  ${Text} {
    margin-top: 0;
    margin-bottom: 0;
    font-size: 13px;
    line-height: 19px;
  }

  h3 {
    font-size: ${compact ? "14px" : "16px"};
    line-height: 1.2em;
    overflow-wrap: anywhere;
    margin-bottom: 0;
    color: ${active && isSelected ? color("brand") : ""};
  }

  .Icon-info {
    color: ${color("text-light")};
  }
`;

export const Description = styled(Text)`
  padding-left: ${space(1)};
  margin-top: ${space(1)} !important;
  border-left: 2px solid ${lighten("brand", 0.45)};
`;

export const ResultSpinner = styled(LoadingSpinner)`
  display: flex;
  flex-grow: 1;
  align-self: center;
  justify-content: flex-end;
  margin-left: ${space(1)};
  color: ${color("brand")};
`;

export const ResultTitle = styled(Text)<TextProps>``;

export const SearchResultContainer = styled(Box)<
  BoxProps &
    HTMLAttributes<HTMLButtonElement> & {
      isActive: boolean;
      isSelected: boolean;
    }
>`
  display: grid;
  grid-template-columns: auto 1fr auto;
  justify-content: center;
  align-items: center;
  gap: 0.5rem 0.75rem;

  ${({ theme, isActive, isSelected }) =>
    isActive &&
    css`
      border-radius: ${theme.radius.md};
      color: ${isSelected && theme.colors.brand[1]};
      background-color: ${isSelected && theme.colors.brand[0]};

      &:hover {
        background-color: ${theme.colors.brand[0]};
        cursor: pointer;

        ${ResultTitle} {
          color: ${theme.colors.brand[1]};
        }
      }
    `}
`;
