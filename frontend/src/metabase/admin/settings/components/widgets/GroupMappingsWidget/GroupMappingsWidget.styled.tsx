import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import SettingToggle from "../SettingToggle";

export const GroupMappingsToggle = styled(SettingToggle)`
  padding-top: 0;
  opacity: 0.5;
`;

export const GroupMappingsWidgetRoot = styled.div`
  display: flex;
  flex-direction: column;
  width: 720px;
`;

export const GroupMappingsWidgetHeader = styled.div`
  background-color: ${color("bg-light")};
  display: flex;
  padding: ${space(0)} ${space(2)};
  justify-content: space-between;

  span {
    font-weight: 700;
  }
`;

export const GroupMappingsWidgetToggleRoot = styled.div`
  align-items: center;
  display: flex;

  > * {
    padding-right: ${space(1)};
  }
`;

export const GroupMappingsWidgetAbout = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;

  span {
    padding-left: ${space(1)};
  }
`;

export const GroupMappingsWidgetAboutContentRoot = styled.div`
  display: flex;
  align-items: center;
`;
