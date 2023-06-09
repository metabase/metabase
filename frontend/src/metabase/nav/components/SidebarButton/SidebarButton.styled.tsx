import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const SidebarIcon = styled(Icon)`
  color: ${color("brand")};
  display: block;
`;

export const SidebarButtonRoot = styled.button`
  cursor: pointer;
  display: block;
`;
