import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import Icon from "metabase/components/Icon";

export const SettingsPopoverBody = styled.div`
  padding: ${space(3)};
`;

export const SectionLabel = styled.div`
  color: ${color("text-medium")};
  font-weight: bold;
  padding-left: ${space(0)};
  margin-bottom: ${space(1)};
`;

export const Divider = styled.div`
  border-bottom: 1px solid ${color("border")};
  margin: ${space(2)} 0;
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-left: ${space(0)};
  margin-bottom: ${space(1)};
`;

export const SettingsTriggerIcon = styled(Icon)`
  color: ${color("brand")};
  &:hover {
    color: ${lighten("brand", 0.1)};
  }
`;
