// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { hueRotate } from "metabase/lib/colors";

export const LogoRoot = styled.img`
  filter: hue-rotate(${() => hueRotate("brand")}deg);
`;
