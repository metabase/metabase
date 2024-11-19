import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const ChartSettingsFooterRoot = styled.div`
  display: flex;
  justify-content: end;
  padding: 1rem 2rem;
  ${Button} {
    margin-left: 1rem;
  }
`;
