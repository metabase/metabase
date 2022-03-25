import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";

type ToggleButtonProps = {
  primaryColor?: string;
};

export const ToggleButton = styled(Button)<ToggleButtonProps>`
  border: none;
  border-radius: 0;
  padding-left: 0;
  padding-right: 0;
  background: none;

  &:hover {
    color: ${props => `${props.primaryColor || color("brand")}`};
    background: none;
  }
`;
