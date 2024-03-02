import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const RadioLabelRoot = styled.span`
  display: flex;
`;

export const RadioLabelTitle = styled.span`
  flex: 1 1 auto;
`;

export const RadioLabelButton = styled(IconButtonWrapper)`
  color: ${color("text-dark")};
  margin-left: 1rem;
  font-weight: bold;

  &:hover {
    color: ${color("brand")};
  }
`;
