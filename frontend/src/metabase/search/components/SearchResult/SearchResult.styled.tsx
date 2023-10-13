import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Link from "metabase/core/components/Link";
import Text from "metabase/components/type/Text";
import LoadingSpinner from "metabase/components/LoadingSpinner";

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

export const ResultInner = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

export const ResultLinkContent = styled.div`
  display: flex;
  align-items: start;
  overflow-wrap: anywhere;
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
