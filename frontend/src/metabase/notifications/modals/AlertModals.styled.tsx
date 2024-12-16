import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const DangerZone = styled.div`
  ${Button.Root} {
    opacity: 0.4;
    background: var(--mb-color-bg-light);
    border: 1px solid var(--mb-color-border);
    color: var(--mb-color-text-dark);
    transition: none;
  }

  &:hover {
    border-color: ${() => color("accent3")};
    transition: border 0.3s ease-in;

    ${Button.Root} {
      opacity: 1;
      background-color: ${() => color("accent3")};
      border-color: ${() => color("accent3")};
      color: var(--mb-color-text-white);
    }
  }
`;
