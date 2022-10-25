import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
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
  display: flex;
  align-items: center;
  margin-left: ${props =>
    props.orientation === "horizontal" &&
    props.alignment === "start" &&
    "0.5rem"};
  margin-right: ${props =>
    props.orientation === "horizontal" &&
    props.alignment === "end" &&
    "0.5rem"};
  margin-bottom: 0.5rem;
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 0.77rem;
  font-weight: 900;
`;

export const FieldDescription = styled.div`
  margin-bottom: 0.5rem;
`;
