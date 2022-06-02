import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

import {
  shrinkOrExpandOnClick,
  shrinkOrExpandDuration,
} from "metabase/styled-components/theme/button";

export const QuestionActionsContainer = styled.div`
  border-left: 1px solid #eeecec;
  margin-left: 1rem;
  padding-left: 1rem;
`;

export const PopoverContainer = styled.div`
  padding: 1rem;
  min-width: 260px;
`;

export const PopoverButton = styled(Button)`
  width: 100%;
  ${Button.Content} {
    justify-content: start;
  }

  ${Button.TextContainer} {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }
`;

export type AnimationStates = "expand" | "shrink" | null;

interface BookmarkButtonProps {
  animation: AnimationStates;
  isBookmarked: boolean;
}

export const BookmarkButton = styled(Button)<BookmarkButtonProps>`
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

      &:hover {
        color: ${props =>
          props.isBookmarked ? color("brand") : color("text-dark")};
      }
  }
`;
