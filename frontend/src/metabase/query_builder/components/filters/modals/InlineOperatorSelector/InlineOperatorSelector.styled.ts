import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color, alpha, darken, lighten } from "metabase/lib/colors";

export const InlineOperatorContainer = styled.div`
  font-weight: bold;
  margin: ${space(1)} 0;
`;

export const FieldTitle = styled.span`
  color: ${color("text-dark")};
`;

export const OperatorDisplay = styled.button`
  font-weight: bold;
  color: ${props => (props.onClick ? color("brand") : color("text-light"))};
  ${props => (props.onClick ? "cursor: pointer;" : "")} :hover {
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
