import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Container = styled.div`
  display: flex;
  flex-wrap: no-wrap;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid ${color("border")};
  padding: ${space(1)} ${space(2)} ${space(2)} ${space(2)};
`;

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
  margin-right: ${space(2)};
`;
