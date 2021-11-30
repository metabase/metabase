import styled from "styled-components";
import { Link } from "react-router";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";

export const OverworldRoot = styled.div`
  padding: 0 1rem;

  ${breakpointMinSmall} {
    padding: 0 2rem;
  }

  ${breakpointMinMedium} {
    padding: 0 4rem;
  }
`;

export const DatabaseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
`;

export const DatabaseIcon = styled(Icon)`
  display: block;
  color: ${color("database")};
  width: 2rem;
  height: 2rem;
  margin-bottom: 4.5rem;
`;

export const DatabaseTitle = styled.span`
  display: block;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
`;

export const DatabaseCard = styled(Link)`
  display: block;
  padding: 2rem;
  border-radius: 0.25rem;
  background-color: ${color("bg-medium")};

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

  &:hover {
    color: ${color("brand")};
  }
`;
