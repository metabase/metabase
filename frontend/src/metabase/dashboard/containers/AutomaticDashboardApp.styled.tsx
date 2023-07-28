import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const ListRoot = styled.ol`
  margin: 0.5rem 0;
`;

export const ItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const ItemDescription = styled.div`
  margin-left: auto;
`;

export const SidebarRoot = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem 2rem;
`;

export const SidebarHeader = styled.h2`
  padding: 0.5rem 0;
`;

export const XrayIcon = styled(Icon)`
  color: ${color("accent4")};
  margin-right: 1rem;
`;
