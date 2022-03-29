import styled from "@emotion/styled";
import { alpha, color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Markdown from "metabase/core/components/Markdown";

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

export const CardIcon = styled(Icon)`
  color: ${color("brand")};
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

export const CardBody = styled.div`
  flex: 1 1 auto;
  padding: 0.25rem 0.75rem 0;
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
  color: ${color("brand")};
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
