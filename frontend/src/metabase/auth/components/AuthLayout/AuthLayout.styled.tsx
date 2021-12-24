import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const LayoutRoot = styled.div`
  position: relative;
  min-height: 100vh;
`;

export const LayoutBody = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  padding: 0 1rem 2rem;
  min-height: 100%;
`;

export const LayoutCard = styled.div`
  margin-top: 1.5rem;
  padding: 2rem 3.5rem;
  max-width: 30.875rem;
  background-color: ${color("white")};
  box-shadow: 0 1px 15px ${color("shadow")};
  border-radius: 6px;
`;
