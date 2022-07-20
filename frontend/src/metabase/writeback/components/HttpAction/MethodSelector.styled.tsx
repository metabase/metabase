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

export const Tab = styled(ButtonBase)`
  font-weight: bold;
  color: ${color("brand")};
  background-opacity: 0.25;

  &:hover {
    background-color: ${color("accent0-light")};
    background-opacity: 0.25;
  }
`;
