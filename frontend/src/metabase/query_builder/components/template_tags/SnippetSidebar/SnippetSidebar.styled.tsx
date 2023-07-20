import styled from "@emotion/styled";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const SidebarIcon = styled(Icon)`
  color: ${color("text-light")};
  margin-right: 0.5rem;
`;

export const SidebarFooter = styled.div`
  display: flex;
  padding: 1rem;
  font-size: 0.875em;
  color: ${color("text-medium")};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};

    ${SidebarIcon} {
      color: ${color("brand")};
    }
  }
`;
