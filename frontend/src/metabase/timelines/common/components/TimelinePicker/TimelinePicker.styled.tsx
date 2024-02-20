import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ListRoot = styled.div`
  display: block;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  margin: 0 1rem;
  min-width: 0;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  margin-bottom: 0.125rem;
  word-wrap: break-word;
`;

export const CardDescription = styled.div`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  word-wrap: break-word;
`;

export const CardIcon = styled(Icon)`
  color: ${color("text-dark")};
  width: 1rem;
  height: 1rem;
`;

export const CardIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid ${color("border")};
  border-radius: 1rem;
`;

export const CardAside = styled.div`
  flex: 0 0 auto;
  color: ${color("text-dark")};
  font-size: 0.75rem;
`;

export interface CardProps {
  isSelected?: boolean;
}

const selectedStyles = css`
  background-color: ${color("brand")};

  ${CardTitle}, ${CardDescription}, ${CardAside} {
    color: ${color("white")};
  }

  ${CardIcon} {
    color: ${color("brand")};
  }

  ${CardIconContainer} {
    border-color: ${color("white")};
    background-color: ${color("white")};
  }
`;

export const CardRoot = styled.div<CardProps>`
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: 0.25rem;
  cursor: pointer;
  ${props => props.isSelected && selectedStyles}

  &:hover {
    ${selectedStyles}
  }

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;
