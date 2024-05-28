import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SettingTitle = styled.label`
  display: block;
  color: ${color("text-medium")};
  font-weight: bold;
  text-transform: uppercase;
`;

export const SettingDescription = styled.div`
  line-height: 1.5;
  color: ${color("text-medium")};
  margin: ${space(1)} 0;
  max-width: 38.75rem;
`;
