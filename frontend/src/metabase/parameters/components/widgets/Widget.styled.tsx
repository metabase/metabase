import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const WidgetRoot = styled.div`
  min-width: 300px;
`;

export const WidgetLabel = styled.label`
  display: block;
  font-weight: bold;
  margin: ${space(1)};
  margin-bottom: 0;
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: ${space(1)};
  border-top: 1px solid ${color("border")};
`;

export const TokenFieldWrapper = styled.div`
  margin: ${space(1)};
`;
