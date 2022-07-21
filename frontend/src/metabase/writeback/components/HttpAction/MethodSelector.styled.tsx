import styled from "@emotion/styled";
import ButtonBase from "metabase/core/components/Button";
import { color, alpha, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const Tabs = styled.nav`
  display: flex;
  align-items: center;

  & > * ~ * {
    margin-left: ${space(1)};
    margin-right: ${space(1)};
  }
`;

export const Tab = styled(ButtonBase)<{ active: boolean }>`
  font-weight: bold;
  color: ${props => (props.active ? color("brand") : color("text-medium"))};
  background-opacity: 0.25;
  padding: ${space(0)} ${space(1)};

  &:hover {
    background-color: ${color("accent0-light")};
    background-opacity: 0.25;
  }
`;
