import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const DatabaseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
`;

export const DatabaseIcon = styled(Icon)`
  display: block;
  color: ${props => color(props.isActive ? "database" : "bg-medium")};
  width: 2rem;
  height: 2rem;
  margin-bottom: 3rem;
`;

export const DatabaseTitle = styled.span`
  display: block;
  color: ${props => color(props.isActive ? "text-dark" : "brand")};
  font-size: 1.17em;
  font-weight: 700;
`;

export const DatabaseCardRoot = styled(Link)`
  display: block;
  padding: 1.875rem;
  border: 0.125rem solid ${color("bg-medium")};
  border-radius: 0.25rem;
  background-color: ${props => (props.isActive ? color("bg-medium") : "")};

  &:hover ${DatabaseTitle} {
    color: ${color("brand")};
  }
`;
