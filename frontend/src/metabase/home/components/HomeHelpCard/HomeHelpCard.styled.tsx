// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Icon } from "metabase/ui";

export const CardIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: var(--mb-color-text-dark);
  width: 1rem;
  height: 1rem;
`;

export const CardTitle = styled.div`
  color: var(--mb-color-text-dark);
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
`;
