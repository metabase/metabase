import styled from "@emotion/styled";

import Card from "metabase/components/Card";
import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const ToastCard = styled(Card)`
  align-items: center;
  padding: 12px 16px;
`;

export const ToastMessage = styled.span`
  color: ${color("text-dark")};
  font-weight: bold;
`;

export const TabIcon = styled(Icon)`
  color: ${color("text-dark")};
  margin-right: ${space(1)};
`;

export const CloseIcon = styled(Icon)`
  margin-left: ${space(2)};
  color: ${color("bg-dark")};
  cursor: pointer;

  :hover {
    color: ${lighten(color("bg-dark"), 0.3)};
  }
`;
