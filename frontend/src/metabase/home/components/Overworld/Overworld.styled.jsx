import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Subhead from "metabase/components/type/Subhead";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const OverworldRoot = styled.div`
  padding: 0 1rem;

  ${breakpointMinSmall} {
    padding: 0 2rem;
  }

  ${breakpointMinMedium} {
    padding: 0 4rem;
  }
`;

export const GreetingContent = styled.div`
  display: flex;
  align-items: center;
`;

export const GreetingTitle = styled(Subhead)`
  margin-left: 1rem;
`;

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

export const SectionHeader = styled.div`
  display: flex;
  margin-bottom: 1rem;
`;

export const SectionTitle = styled.div`
  color: ${color("text-medium")};
  font-size: 0.83em;
  font-weight: 900;
  line-height: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

export const SectionIcon = styled(Icon)`
  display: block;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;

export const Section = styled.div`
  margin: 2.5rem 0;

  ${SectionIcon} {
    visibility: collapse;
  }

  &:hover ${SectionIcon} {
    visibility: visible;
  }
`;
