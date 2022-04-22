import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const SidebarIcon = styled(Icon)`
  color: ${color("brand")};
`;

export const SidebarButtonRoot = styled.button`
  margin-left: ${space(1)};
  margin-top: ${space(1)};
  cursor: pointer;
`;
