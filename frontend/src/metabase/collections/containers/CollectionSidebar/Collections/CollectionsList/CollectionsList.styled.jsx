import styled from "styled-components";

import { color } from "metabase/lib/colors";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const ExpandCollectionButton = styled(IconButtonWrapper)`
  align-items: center;
  color: ${color("brand")};
  cursor: pointer;
  left: -20px;
  position: absolute;
`;
