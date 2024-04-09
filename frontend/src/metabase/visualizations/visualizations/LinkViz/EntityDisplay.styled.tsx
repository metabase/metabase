import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";

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
  gap: 0.5rem;
`;

export const EllipsifiedEntityContainer = styled(Ellipsified)`
  flex: 1;
`;
