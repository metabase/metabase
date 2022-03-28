import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import Icon from "metabase/components/Icon";

export const BookmarkListRoot = styled.div`
  margin: ${space(1)} 0;

  &:hover {
    button {
      opacity: 0.5;
    }
  }

  button {
    opacity: 0;
    color: ${color("brand")};
    cursor: pointer;
    margin-right: ${space(0)};
  }
`;

export const BookmarkTypeIcon = styled(Icon)`
  margin-right: 6px;
  opacity: 0.5;
`;
