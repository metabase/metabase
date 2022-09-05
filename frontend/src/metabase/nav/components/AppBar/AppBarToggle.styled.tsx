import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const SidebarButton = styled.button`
  cursor: pointer;
  display: block;
`;

export const SidebarIcon = styled(Icon)`
  color: ${color("brand")};
  display: block;
`;
