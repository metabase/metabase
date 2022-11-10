import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { FieldAlignment, FieldOrientation } from "./types";

export const FieldLabelError = styled.span`
  color: ${color("error")};
`;

export interface FieldRootProps {
  orientation: FieldOrientation;
  hasError: boolean;
}

export const FieldRoot = styled.div<FieldRootProps>`
  display: ${props => props.orientation === "horizontal" && "flex"};
  color: ${props => (props.hasError ? color("error") : color("text-medium"))};
  margin-bottom: 1.25rem;

  &:focus-within {
    color: ${color("text-medium")};

    ${FieldLabelError} {
      display: none;
    }
  }
`;

export interface FormCaptionProps {
  alignment: FieldAlignment;
  orientation: FieldOrientation;
}

export const FieldCaption = styled.div<FormCaptionProps>`
  margin-left: ${props =>
    props.orientation === "horizontal" &&
    props.alignment === "start" &&
    "0.5rem"};
  margin-right: ${props =>
    props.orientation === "horizontal" &&
    props.alignment === "end" &&
    "0.5rem"};
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 0.77rem;
  font-weight: 900;
`;

export const FieldLabelContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5em;
`;

export const FieldDescription = styled.div`
  margin-bottom: 0.5rem;
`;

export const FieldInfoIcon = styled(Icon)`
  color: ${color("bg-dark")};
  margin-left: 0.5rem;
  width: 0.75rem;
  height: 0.75rem;

  &:hover {
    color: ${() => color("brand")};
  }
`;

export const FieldInfoLabel = styled.div`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  margin-left: auto;
  cursor: default;
`;
