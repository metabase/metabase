import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

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
