import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export interface FieldRootProps {
  error?: string;
}

export const FieldRoot = styled.div<FieldRootProps>`
  color: ${props => (props.error ? color("error") : color("text-medium"))};
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
