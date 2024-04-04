import styled from "@emotion/styled";

import { FixedSizeIcon, Loader } from "metabase/ui";

export const LoaderInButton = styled(Loader)`
  position: relative;
  top: 1px;
`;

export const IconInButton = styled(FixedSizeIcon)`
  position: relative;
  top: 1px;
`;

export const LoaderInDarkButton = styled(LoaderInButton)`
  filter: brightness(100);
`;
