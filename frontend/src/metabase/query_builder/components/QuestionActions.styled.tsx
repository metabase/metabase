import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";
import EntityMenu from "metabase/components/EntityMenu";
import DatasetMetadataStrengthIndicator from "./view/sidebars/DatasetManagementSection/DatasetMetadataStrengthIndicator";

import {
  shrinkOrExpandOnClick,
  shrinkOrExpandDuration,
} from "metabase/styled-components/theme/button";

export const QuestionActionsDivider = styled.div`
  border-left: 1px solid ${color("border-dark")};
  margin-left: 1rem;
  padding-left: 0.5rem;
  height: 1.25rem;
`;

export const StrengthIndicator = styled(DatasetMetadataStrengthIndicator)`
  float: none;
  margin-left: 3.5rem;
`;

export const QuestionEntityMenu = styled(EntityMenu)`
  margin-left: 0.5rem;
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
