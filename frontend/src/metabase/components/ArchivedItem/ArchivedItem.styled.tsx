import styled from "@emotion/styled";

import IconWrapper from "metabase/components/IconWrapper";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ItemIcon = styled(Icon)`
  display: block;
`;

export const ItemIconContainer = styled(IconWrapper)`
  padding: 0.5rem;
  margin-right: 0.5rem;
  line-height: 1;
`;

export const ActionIcon = styled(Icon)`
  cursor: pointer;
  margin-left: 2rem;

  &:hover {
    color: ${color("brand")};
  }
`;
