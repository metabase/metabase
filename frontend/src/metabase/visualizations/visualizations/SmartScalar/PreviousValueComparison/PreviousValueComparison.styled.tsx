// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Icon } from "metabase/ui";

export const VariationIcon = styled(Icon)`
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  margin-right: var(--mantine-spacing-sm);
`;

export const VariationValue = styled(Ellipsified)`
  font-weight: 900;
`;
