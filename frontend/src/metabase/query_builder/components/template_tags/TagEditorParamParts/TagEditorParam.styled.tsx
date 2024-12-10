import styled from "@emotion/styled";

import { ParameterValueWidget } from "metabase/parameters/components/ParameterValueWidget";

interface ContainerLabelProps {
  paddingTop?: boolean;
}

export const ContainerLabel = styled.div<ContainerLabelProps>`
  display: block;
  margin-bottom: 0.5em;
  padding-top: ${props => (props.paddingTop ? "0.5rem" : "0")};
  color: var(--mb-color-text-medium);
  font-weight: 700;
`;

export const ErrorSpan = styled.span`
  color: var(--mb-color-error);
`;

interface InputContainerProps {
  lessBottomPadding?: boolean;
}
export const InputContainer = styled.label<InputContainerProps>`
  display: block;
  padding-bottom: ${props => (props.lessBottomPadding ? "1.5rem" : "2rem")};
`;

export const DefaultParameterValueWidget = styled(ParameterValueWidget)`
  color: var(--mb-color-text-dark);
  padding: 0.75rem 0.75rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 4px;
  background-color: var(--mb-color-bg-white);
  font-weight: normal;
`;
