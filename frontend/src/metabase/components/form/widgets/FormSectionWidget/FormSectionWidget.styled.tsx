import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Button } from "metabase/core/components/Button";

export const WidgetButton = styled(Button)`
  color: ${color("brand")};
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    background-color: transparent;
  }
`;
