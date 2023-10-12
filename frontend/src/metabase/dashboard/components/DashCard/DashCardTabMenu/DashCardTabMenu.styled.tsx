import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";
import type { AnchorProps } from "metabase/ui";
import { Anchor } from "metabase/ui";

type TapButtonProps = AnchorProps & HTMLAttributes<HTMLAnchorElement>;
export const TabButton = styled(Anchor)<TapButtonProps>`
  font-weight: bold;
  color: ${color("text-dark")};

  &:hover {
    color: ${color("brand")};
    text-decoration: none;
  }
`;

export const ChevronStyledIcon = styled(Icon)`
  flex-shrink: 0;
  &:hover {
    cursor: pointer;
    color: ${color("brand")};
  }
`;
