// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import BaseTabList from "metabase/common/components/TabList";
import { alpha } from "metabase/lib/colors";

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
`;

interface ScrollButtonProps {
  direction: "left" | "right";
}

export const ScrollButton = styled.button<ScrollButtonProps>`
  position: absolute;
  cursor: pointer;
  height: calc(100% - 2px);
  top: 0;
  width: 3rem;
  text-align: ${(props) => props.direction};
  color: var(--mb-color-text-tertiary);

  &:hover {
    color: var(--mb-color-brand);
  }
  ${(props) => props.direction}: 0;

  background: linear-gradient(
    to ${(props) => props.direction},
    ${() => alpha("background-primary", 0.1)},
    ${() => alpha("background-primary", 0.5)},
    30%,
    var(--mb-color-background-primary)
  );
`;
