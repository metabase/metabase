import styled from "@emotion/styled";

import BaseTabButton from "metabase/core/components/TabButton";
import BaseButton from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  align-items: start;
  gap: 1.5rem;
`;

export const TabButton = styled(BaseTabButton.Renameable)`
  padding-top: 0;
  padding-bottom: 0.5rem;
`;

export const Button = styled(BaseButton)`
  border: none;
`;
