import styled from "@emotion/styled";

import Markdown from "metabase/core/components/Markdown";
import { alpha, color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export interface CardRootProps {
  isSelected?: boolean;
}

export const CardRoot = styled.div<CardRootProps>`
  display: flex;
  padding: 0.25rem 0.75rem;
  border-left: 0.25rem solid
    ${props => (props.isSelected ? color("brand") : "transparent")};
  background-color: ${props =>
    props.isSelected ? alpha("brand", 0.03) : "transparent"};
  cursor: pointer;

  &:hover {
    background-color: ${alpha("brand", 0.03)};
  }
`;

export const CardIconAndDateContainer = styled.div`
  display: flex;
`;

export const CardIcon = styled(Icon)`
  margin: 0.25rem 0.25rem 0 0;
  width: 1rem;
  height: 1rem;
`;

export const CardCheckboxContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2rem;
  height: 2rem;
`;

export const CardBody = styled.div`
  flex: 1 1 auto;
  padding: 0.125rem 0.75rem 0 0.125rem;
  min-width: 0;
`;

export const CardTitle = styled.div`
  color: ${color("text-dark")};
  font-size: 1rem;
  line-height: 1.25rem;
  font-weight: bold;
  word-wrap: break-word;
`;

export const CardDescription = styled(Markdown)`
  color: ${color("text-dark")};
  margin-top: 0.25rem;
  word-wrap: break-word;
`;

export const CardDateInfo = styled.div`
  font-size: 0.75rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const CardCreatorInfo = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.25rem;
  font-size: 0.75rem;
`;

export const CardAside = styled.div`
  flex: 0 0 auto;
  align-self: start;
`;
