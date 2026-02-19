// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button } from "metabase/common/components/Button";

export const TriggerButton = styled(Button)`
  padding: 0;
  border: none;

  &:hover {
    background: unset;
  }
`;
