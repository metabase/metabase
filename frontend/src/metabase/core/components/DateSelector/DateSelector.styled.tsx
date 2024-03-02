import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const SelectorTimeContainer = styled.div`
  margin: 0 0.75rem;
`;

export const SelectorFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 1rem 0.75rem 0.75rem;
`;

export const SelectorTimeButton = styled(Button)`
  padding-left: 0;
  padding-right: 0;
`;

export const SelectorSubmitButton = styled(Button)`
  margin-left: auto;
`;
