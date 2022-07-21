import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color, alpha, darken, lighten } from "metabase/lib/colors";

export const InlineOperatorContainer = styled.div`
  font-weight: bold;
  font-size: 1rem;
  margin-bottom: 0.875rem;
  display: inline-flex;
  align-items: flex-start;
`;

export const FieldTitle = styled.span`
  color: ${color("text-dark")};
  margin-right: ${space(1)};
`;

export const TableTitle = styled.span`
  color: ${color("text-dark")};
  margin-right: ${space(1)};
`;

export const LightText = styled.span`
  color: ${color("text-light")};
`;

export const OperatorDisplay = styled.button`
  font-weight: bold;
  text-decoration: ${props => (props.onClick ? "underline" : "none")};
  text-underline-offset: 2px;
  color: ${color("text-light")};
  text-transform: lowercase;

  ${props => (props.onClick ? "cursor: pointer;" : "")} &:hover {
    color: ${props =>
      props.onClick ? lighten("brand", 0.1) : color("text-light")};
  }
`;

export const OptionContainer = styled.div`
  padding: ${space(2)};
`;

export const Option = styled.div`
  font-weight: bold;
  cursor: pointer;
  border-radius: ${space(1)};
  padding: 0.25rem 0.5rem;

  &:hover {
    background-color: ${color("brand")};
    color: ${color("white")};
  }
`;
