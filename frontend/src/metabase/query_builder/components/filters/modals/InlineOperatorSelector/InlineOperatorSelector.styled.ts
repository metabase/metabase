import styled from "@emotion/styled";
import {
  space,
  breakpointMinHeightMedium,
  breakpointMaxSmall,
} from "metabase/styled-components/theme";

import { color, lighten } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

export const InlineOperatorContainer = styled.div`
  font-weight: bold;
  font-size: 0.875rem;
  ${breakpointMinHeightMedium} {
    font-size: 1rem;
  }
  ${breakpointMaxSmall} {
    margin-bottom: 0.875rem;
  }
  display: flex;
  width: 100%;
  align-items: center;
`;

export const FieldNameContainer = styled.div`
  display: inline-flex;
  align-items: flex-start;
`;

export const FieldIcon = styled(Icon)`
  margin-right: ${space(1)};
  width: 1rem;
  height: 1rem;
  ${breakpointMinHeightMedium} {
    width: 1.25rem;
    height: 1.25rem;
  }
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
  color: ${color("brand")};
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
