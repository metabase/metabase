import styled from "styled-components";

import Icon from "metabase/components/Icon";

export const ToggleMobileSidebarIcon = styled(Icon)`
  cursor: pointer;
  @media screen and (min-width: 768px) {
    display: none;
  }
`;
