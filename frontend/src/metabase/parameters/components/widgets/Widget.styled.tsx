import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Button } from "metabase/core/components/Button";

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
  border-top: 1px solid ${color("border")};
  padding: ${space(1)};
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
`;

export const UpdateButton = styled(Button)`
  justify-self: end;
  grid-column-start: 2;
`;

UpdateButton.defaultProps = {
  purple: true,
};

export const TokenFieldWrapper = styled.div`
  margin: ${space(1)};
  border: 1px solid ${color("border")};
`;
