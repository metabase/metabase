import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface FieldRootProps {
  hasError?: boolean;
}

export const FieldRoot = styled.div<FieldRootProps>`
  color: ${props => (props.hasError ? color("error") : color("text-medium"))};
  margin-bottom: 1.5em;
`;

export const FieldCaption = styled.div`
  display: flex;
  align-items: center;
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
