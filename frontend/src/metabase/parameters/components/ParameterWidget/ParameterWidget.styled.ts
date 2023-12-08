import styled from "@emotion/styled";
import FieldSet from "metabase/components/FieldSet";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

interface ParameterFieldSetProps {
  fieldHasValueOrFocus?: boolean;
}

export const ParameterFieldSet = styled(FieldSet)<ParameterFieldSetProps>`
  display: flex;
  align-items: center;
  transition: opacity 500ms linear;
  border: 2px solid
    ${props => (props.fieldHasValueOrFocus ? color("brand") : color("border"))};
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
    ${props => (props.isEditingParameter ? color("brand") : color("border"))};
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: bold;
  min-width: 170px;
  margin-right: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  color: ${props => props.isEditingParameter && color("white")};
  background-color: ${props =>
    props.isEditingParameter ? color("brand") : color("white")};
`;

export const SettingsIcon = styled(Icon)`
  margin-left: auto;
  padding-left: 1rem;
`;
