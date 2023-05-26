import styled from "@emotion/styled";
import { space, breakpointMaxSmall } from "metabase/styled-components/theme";

import { color, lighten } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

export const InlineOperatorContainer = styled.div`
  font-weight: bold;
  font-size: 0.875rem;
  ${breakpointMaxSmall} {
    margin-bottom: 0.875rem;
  }
  display: flex;
  width: 100%;
  align-items: center;
`;

export const FieldNameContainer = styled.div`
  display: inline-flex;
  align-items: flex-end;
`;

export const FieldIcon = styled(Icon)`
  margin-right: ${space(1)};
  color: ${color("text-medium")};
  width: 1rem;
  height: 1rem;
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
  color: ${props => (props.onClick ? color("brand") : color("text-medium"))};
  text-transform: lowercase;

  ${props => (props.onClick ? "cursor: pointer;" : "")}

  &:hover {
    color: ${props =>
      props.onClick ? lighten("brand", 0.1) : color("text-medium")};
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
