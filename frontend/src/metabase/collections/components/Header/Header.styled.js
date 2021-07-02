import styled from "styled-components";

import Icon from "metabase/components/Icon";

export const ToggleMobileSidebarIcon = styled(Icon).attrs({
  ml: 1,
  mr: 2,
  mt: "4px",
  name: "burger",
  size: 20,
})`
  color: {color("text-dark")};
  cursor: pointer;

  @media screen and (min-width: 768px) {
    display: none;
  }
`;
