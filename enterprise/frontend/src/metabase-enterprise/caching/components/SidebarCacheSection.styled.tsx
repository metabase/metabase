import styled from "@emotion/styled";
import type { AnchorHTMLAttributes } from "react";

import type { AnchorProps } from "metabase/ui";
import { Anchor } from "metabase/ui";

export const FormLauncher = styled(Anchor)<
  AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>
>`
  font-weight: bold;
  &:hover,
  &:active {
    color: var(--mb-color-brand);
    text-decoration: none;
  }
`;
