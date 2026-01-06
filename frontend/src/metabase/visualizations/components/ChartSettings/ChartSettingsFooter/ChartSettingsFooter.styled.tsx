// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button } from "metabase/common/components/Button";

export const ChartSettingsFooterRoot = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 1rem 2rem;
  ${Button} {
    margin-left: 1rem;
  }
`;
