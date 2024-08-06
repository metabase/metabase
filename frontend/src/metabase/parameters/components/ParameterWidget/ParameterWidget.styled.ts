import styled from "@emotion/styled";

import { FieldSet } from "metabase/components/FieldSet";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

interface ParameterFieldSetProps {
  fieldHasValueOrFocus?: boolean;
}

export const ParameterFieldSet = styled(FieldSet)<ParameterFieldSetProps>`
  background: var(--mb-color-background);
  display: flex;
  align-items: center;
  transition: opacity 500ms linear;
  border: 2px solid
    ${props =>
      props.fieldHasValueOrFocus ? color("brand") : "var(--mb-color-border)"};
  margin: 0.5em 0;
  padding: 0.25em 1em;
  width: 100%;

  legend {
    text-transform: none;
    position: relative;
    height: 2px;
    line-height: 0;
    margin-left: -0.45em;
    padding: 0 0.5em;
  }

  @media screen and (min-width: 440px) {
    margin-right: 0.85em;
    width: auto;
  }
`;

interface ParameterContainerProps {
  isEditingParameter?: boolean;
}

export const ParameterContainer = styled.div<ParameterContainerProps>`
  display: flex;
  align-items: center;
  border: 1px solid
    ${props =>
      props.isEditingParameter ? color("brand") : "var(--mb-color-border)"};
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: bold;
  min-width: 170px;
  margin: 0.25rem 0.5rem 0.25rem 0;
  padding: 0.5rem;
  color: ${props => props.isEditingParameter && color("text-white")};
  background-color: ${props =>
    props.isEditingParameter ? color("brand") : color("bg-white")};
`;

export const SettingsIcon = styled(Icon)`
  margin-left: auto;
  padding-left: 1rem;
`;
