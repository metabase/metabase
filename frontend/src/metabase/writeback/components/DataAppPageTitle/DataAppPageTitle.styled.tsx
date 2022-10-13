import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Icon from "metabase/components/Icon";
import SelectList from "metabase/components/SelectList";

import { color } from "metabase/lib/colors";

export const IconButton = styled(IconButtonWrapper)`
  ${Icon.Root} {
    color: ${color("brand-light")};
  }

  &:hover {
    ${Icon.Root} {
      color: ${color("brand")};
    }
  }
`;

export const Root = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    ${IconButton} {
      opacity: 1;
    }
  }
`;

export const OptionsList = styled(SelectList)`
  padding: 0.5rem;
  min-width: 300px;
  height: 300px;
  overflow-y: scroll;
`;
