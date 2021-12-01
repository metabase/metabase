import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const DatabaseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1rem;

  ${breakpointMinSmall} {
    grid-template-columns: repeat(2, 1fr);
  }

  ${breakpointMinMedium} {
    grid-template-columns: repeat(3, 1fr);
  }
`;

export const DatabaseCardRoot = styled(Link)`
  display: block;
  padding: 1.875rem;
  color: ${props => color(props.isActive ? "text-dark" : "brand")};
  border: 0.125rem solid ${color("bg-medium")};
  border-radius: 0.25rem;
  background-color: ${props => (props.isActive ? color("bg-medium") : "")};

  &:hover {
    color: ${color("brand")};
  }
`;

export const DatabaseCardIcon = styled(Icon)`
  display: block;
  color: ${props => color(props.isActive ? "database" : "bg-medium")};
  width: 2rem;
  height: 2rem;
  margin-bottom: 3rem;
`;

export const DatabaseCardTitle = styled.span`
  display: block;
  font-size: 1.17em;
  font-weight: 700;
`;

export const DatabaseActionLink = styled(Link)`
  display: block;
  margin-left: auto;
  color: ${color("brand")};
  cursor: pointer;
`;
