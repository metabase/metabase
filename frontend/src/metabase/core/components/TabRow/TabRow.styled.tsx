import styled from "@emotion/styled";

import { SortableDiv } from "metabase/core/components/Sortable";
import { TabButton } from "metabase/core/components/TabButton";
import TabLink from "metabase/core/components/TabLink";
import BaseTabList from "metabase/core/components/TabList";
import { alpha, color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const TabList = styled(BaseTabList)`
  width: 100%;

  ${BaseTabList.Content} {
    display: flex;
    align-items: end;
    overflow-x: scroll;
    /* Chrome */
    ::-webkit-scrollbar {
      display: none;
    }

    -ms-overflow-style: none; /* IE and Edge */
    scrollbar-width: none; /* Firefox */
  }

  ${TabLink.Root}:not(:last-child) {
    margin-right: 0.75rem;
  }

  ${TabButton.Root}:not(:last-child) {
    margin-right: 0.75rem;
  }

  ${SortableDiv}:not(:last-child) {
    margin-right: 0.75rem;
  }
`;

interface ScrollButtonProps {
  direction: "left" | "right";
}

export const ScrollButton = styled.button<ScrollButtonProps>`
  position: absolute;
  cursor: pointer;
  height: 100%;
  width: 3rem;
  padding-bottom: ${space(2)};
  text-align: ${props => props.direction};
  color: ${color("text-light")};

  &:hover {
    color: ${color("brand")};
  }

  ${props => props.direction}: 0;

  background: linear-gradient(
    to ${props => props.direction},
    ${alpha("white", 0.1)},
    ${alpha("white", 0.5)},
    30%,
    ${color("white")}
  );
`;
