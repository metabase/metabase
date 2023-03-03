import styled from "@emotion/styled";

import { space } from "metabase/styled-components/theme";
import { color } from "metabase/lib/colors";

export const ParameterFormSection = styled.div`
  margin-top: ${space(2)};
`;

export const ParameterFormLabel = styled.label`
  color: ${color("text-medium")};
  font-size: 0.75rem;
  display: block;
  margin-bottom: ${space(1)};
  font-weight: bold;
`;
