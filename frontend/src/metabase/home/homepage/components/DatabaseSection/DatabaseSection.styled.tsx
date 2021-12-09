import { Link } from "react-router";
import styled from "styled-components";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import {
  breakpointMinMedium,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const ListRoot = styled.div`
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

export const CardTitle = styled.span`
  display: block;
  font-size: 1.17em;
  font-weight: 700;
  overflow: hidden;
`;

export const CardIcon = styled(Icon)`
  display: block;
  width: 2rem;
  height: 2rem;
  margin-bottom: 3rem;
`;

export const CardRoot = styled(Link)`
  display: block;
  padding: 1.875rem;
  border: 0.125rem solid ${color("bg-medium")};
  border-radius: 0.375rem;
  overflow: hidden;
`;

export const DatabaseCardRoot = styled(CardRoot)`
  color: ${color("text-dark")};
  background-color: ${color("bg-medium")};

  ${CardIcon} {
    color: ${color("database")};
  }

  &:hover ${CardTitle} {
    color: ${color("brand")};
  }
`;

export const ActionCardRoot = styled(CardRoot)`
  ${CardTitle} {
    color: ${color("brand")};
  }

  ${CardIcon} {
    color: ${color("brand-light")};
  }

  &:hover {
    border-color: ${color("brand-light")};
    background-color: ${color("brand-light")};
  }

  &:hover ${CardIcon} {
    color: ${color("brand")};
  }
`;

export const ActionLink = styled(Link)`
  display: block;
  margin-left: auto;
  color: ${color("brand")};
  font-weight: 700;
  cursor: pointer;
`;
