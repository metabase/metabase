import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";

export const AddIcon = styled(Icon)`
  color: ${color("text-light")};
  transition: color 300ms;

  &:hover {
    color: ${color("brand")};
  }
`;
