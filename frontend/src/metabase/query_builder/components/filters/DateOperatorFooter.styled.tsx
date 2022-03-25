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
  background: none;
  display: flex;
  align-items: center;
  font-weight: normal;

  &:hover {
    color: ${props => `${props.primaryColor || color("brand")}`};
    background: none;
  }
`;

export const Interval = styled.div`
  display: flex;
  align-items: center;
  font-weight: normal;
  color: ${color("text-medium")};
  margin-left: ${space(1)};
`;
