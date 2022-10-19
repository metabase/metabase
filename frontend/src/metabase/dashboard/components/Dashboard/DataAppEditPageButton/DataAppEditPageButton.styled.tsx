import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

import { color } from "metabase/lib/colors";

export const ClickableRoot = styled(IconButtonWrapper)`
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;

  color: ${color("text-white")};
  background-color: ${color("brand")};
  padding: 0.5rem;
`;
