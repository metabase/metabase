import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { FieldAlignment, FieldOrientation } from "./types";

export interface FieldRootProps {
  orientation: FieldOrientation;
  hasError: boolean;
}

export const FieldRoot = styled.div<FieldRootProps>`
  display: ${props => props.orientation === "horizontal" && "flex"};
  color: ${props => (props.hasError ? color("error") : color("text-medium"))};
  margin-bottom: 1.5em;
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
  margin-bottom: 0.5em;
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 0.88em;
  font-weight: 900;
`;

export const FieldLabelError = styled.span`
  color: ${color("error")};
`;

export const FieldDescription = styled.div`
  margin-bottom: 0.5rem;
`;
