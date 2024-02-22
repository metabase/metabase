import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const SecretKeyWidgetRoot = styled.div`
  display: flex;
  align-items: center;
  max-width: 820px;
  padding: 1rem 0;
`;

export const GenerateButton = styled(Button)`
  margin-left: 1rem;
  height: 100%;
`;
