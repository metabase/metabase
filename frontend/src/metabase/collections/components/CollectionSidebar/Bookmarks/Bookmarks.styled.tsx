import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

const CollectionSidebarBookmarksRoot = styled.div`
  margin-top: ${space(2)};
  margin-bottom: ${space(2)};
`;

export const BookmarkDragIcon = styled(Icon)`
  left: 14px;
  opacity: 0;
  pointer-events: none;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 100;
`;

export const BookmarkTypeIcon = styled(Icon)`
  margin-right: 6px;
`;

export const BookmarkListRoot = styled.div`
  margin: ${space(1)} 0;
`;

type BookmarkContainerProps = {
  isSorting: boolean;
};

export const BookmarkContainer = styled.div<BookmarkContainerProps>`
  overflow: hidden;
  position: relative;
  width: 100%;

  &:hover {
    background: ${color("bg-medium")};

    svg {
      opacity: 1;
    }

    button {
      opacity: 0.5;
    }
  }

  ${({ isSorting }) =>
    isSorting &&
    css`
      background: white;

      &:hover {
        background: white;

        a {
          background: white;
        }

        button {
          opacity: 0;
        }

        > svg {
          opacity: 0;
        }
      }
    `}

  button {
    opacity: 0;
    color: ${color("brand")};
    cursor: pointer;
    padding: ${space(1)};
    margin-top: 2px;
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
  }
`;

export default CollectionSidebarBookmarksRoot;
