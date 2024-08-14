import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

export const UserElement = styled(Button)<
  HTMLAttributes<HTMLButtonElement> & ButtonProps
>`
  flex-shrink: 0;

  &:hover {
    background-color: var(--mb-color-brand-lighter);
  }

  & > div {
    display: flex;
    justify-content: flex-start;
  }
`;
