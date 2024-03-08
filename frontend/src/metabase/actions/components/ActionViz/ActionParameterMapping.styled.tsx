import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ParameterFormSection = styled.div`
  margin-top: ${space(2)};
`;

interface ParameterFormLabelProps {
  error?: boolean;
}

export const ParameterFormLabel = styled.label<ParameterFormLabelProps>`
  color: ${props => (props.error ? color("error") : color("text-medium"))};
  font-size: 0.75rem;
  display: flex;
  gap: ${space(1)};
  align-items: center;
  margin-bottom: ${space(1)};
  font-weight: bold;
`;

export const ParameterFormBadge = styled.span`
  color: ${color("text-dark")};
  background-color: ${color("bg-medium")};
  padding: ${space(0)} ${space(1)};
  border-radius: ${space(0)};
`;
