import styled from "@emotion/styled";

import Link from "metabase/core/components/Link";
import { alpha, color } from "metabase/lib/colors";
import {
  breakpointMinLarge,
  breakpointMinSmall,
} from "metabase/styled-components/theme";

export const CardRoot = styled(Link)`
  display: flex;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: ${color("white")};
  box-shadow: 0 7px 20px var(--mb-color-shadow);
  max-width: 100%;

  ${breakpointMinSmall} {
    max-width: 50%;
  }

  ${breakpointMinLarge} {
    padding: 1.5rem;
  }

  &:hover {
    box-shadow: 0 10px 22px ${() => alpha("shadow", 0.09)};
  }
`;
