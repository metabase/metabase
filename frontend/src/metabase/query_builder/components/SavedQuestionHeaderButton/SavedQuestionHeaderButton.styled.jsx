import styled from "styled-components";
import { color } from "metabase/lib/colors";

import Button from "metabase/components/Button";

export const HeaderButton = styled(Button)`
  font-size: 1.25rem;
  border: none;
  padding: 0.25rem 0.25rem;
  color: ${props => (props.isActive ? color("brand") : "unset")};
  background-color: ${props => (props.isActive ? color("bg-light") : "unset")};

  .Icon:not(.Icon-chevrondown) {
    color: ${props => color(props.leftIconColor)};
  }

  .Icon-chevrondown {
    height: 13px;
  }
`;
