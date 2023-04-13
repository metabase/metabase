import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import ParameterValueWidget from "metabase/parameters/components/ParameterValueWidget";

export const TagContainer = styled.div`
  padding: 1.5rem 1.5rem 0 1.5rem;
  margin-bottom: 1.5rem;
  border-top: 1px solid ${color("border")};
`;
export const TagName = styled.h3`
  font-weight: 900;
  margin-bottom: 2rem;
  align-self: flex-end;
  color: ${color("brand")};
`;

interface ContainerLabelProps {
  paddingTop?: boolean;
}

export const ContainerLabel = styled.div<ContainerLabelProps>`
  display: block;
  font-weight: 700;
  padding-bottom: 0.5rem;
  color: ${color("text-medium")};
  padding-top: ${props => (props.paddingTop ? "0.5rem" : "0")};
`;

export const ErrorSpan = styled.span`
  margin: 0 0.5rem;
  color: ${color("error")};
`;

interface InputContainerProps {
  lessBottomPadding?: boolean;
}
export const InputContainer = styled.label<InputContainerProps>`
  display: block;
  padding-bottom: ${props => (props.lessBottomPadding ? "1.5rem" : "2rem")};
`;

export const DefaultParameterValueWidget = styled(ParameterValueWidget)`
  padding: 0.5rem;
  font-weight: 700;
  color: ${color("text-medium")};
  border-radius: 0.5rem;
  background-color: ${color("white")};
  border: 2px solid ${color("border")};
`;
