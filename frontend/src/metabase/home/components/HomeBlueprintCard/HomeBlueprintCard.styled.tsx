// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import Link from "metabase/common/components/Link";
import { alpha } from "metabase/lib/colors";
import {
  breakpointMinLarge,
  breakpointMinSmall,
} from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export const CardRoot = styled(Link)`
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid var(--mb-color-border);
  border-radius: 0.5rem;
  background-color: var(--mb-color-bg-white);
  box-shadow: 0 7px 20px var(--mb-color-shadow);
  max-width: 100%;

  ${breakpointMinSmall} {
    max-width: 50%;
  }

  ${breakpointMinLarge} {
    padding: 1rem 1.5rem;
  }

  &:hover {
    box-shadow: 0 10px 22px ${() => alpha("shadow", 0.09)};
  }
`;

export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: var(--mb-color-brand);
`;

export const CardTitle = styled(Ellipsified)`
  color: var(--mb-color-text-dark);
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
  max-width: 100%;
`;
