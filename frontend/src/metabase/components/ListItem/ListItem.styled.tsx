import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { Link } from "react-router";

import { color } from "metabase/lib/colors";

interface Props {
  disabled?: boolean;
}

export const Root = styled.li<Props>`
  position: relative;

  ${props =>
    props.disabled &&
    css`
      pointer-events: none;
      opacity: 0.4;
    `};
`;

export const ListItemLink = styled(Link)`
  &:hover {
    color: ${color("brand")};
  }
`;
