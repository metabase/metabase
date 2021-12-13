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

export const CardRoot = styled(Link)`
  display: flex;
  align-items: center;
  padding: 1.125rem 1.5rem;
  color: ${color("text-medium")};
  border: 1px solid ${color("border")};
  border-radius: 0.375rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 2px ${color("shadow")};
  overflow: hidden;

  &:hover {
    color: ${color("brand")};
  }
`;

export const CardIcon = styled(Icon)`
  display: block;
  color: ${color("white")};
  width: 1.25rem;
  height: 1.25rem;
`;

export const CardIconContainer = styled.span`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background-color: ${color("accent4")};
`;

export const CardTitle = styled.span`
  display: block;
  margin-left: 1rem;
  overflow: hidden;
`;
