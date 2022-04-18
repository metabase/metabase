import styled from "@emotion/styled";
import { css } from "@emotion/react";

import Button from "metabase/core/components/Button";
import {
  shrinkOrExpandOnClick,
  shrinkOrExpandDuration,
} from "metabase/styled-components/theme/button.ts";

export const BookmarkButton = styled(Button)`
  ${shrinkOrExpandOnClick}

  ${props =>
    props.animation === "expand" &&
    css`
      animation: expand linear ${shrinkOrExpandDuration};
    `}

  ${props =>
    props.animation === "shrink" &&
    css`
      animation: shrink linear ${shrinkOrExpandDuration};
    `}
`;

export const Container = styled.div`
  display: flex;
  align-items: center;
  column-gap: 0.3rem;
  margin-top: 8px;
`;
