import { color } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";

export const Container = styled.div<{ isSidebar?: boolean }>`
  display: flex;
  flex-wrap: no-wrap;
  justify-content: space-between;
  align-items: center;
  border-top: ${({ isSidebar }) =>
    isSidebar ? "" : `1px solid ${color("border")}`};
  padding: ${({ isSidebar }) =>
    isSidebar
      ? `0 ${space(2)} 0 ${space(2)}`
      : `${space(1)} ${space(2)} ${space(2)} ${space(2)}`};
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
