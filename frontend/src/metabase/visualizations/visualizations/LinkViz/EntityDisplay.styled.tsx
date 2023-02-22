import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

export const EntityDisplayContainer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

export const LeftContainer = styled.div`
  min-width: 0;
  width: 100%;
  display: flex;
  align-items: center;
`;

export const IconWithHorizontalMargin = styled(Icon)`
  margin: 0 1rem;
`;
