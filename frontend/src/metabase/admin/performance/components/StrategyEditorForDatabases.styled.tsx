import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const Panel = styled.section`
  overflow-y: auto;
  display: flex;
  flex-flow: column nowrap;
  background-color: ${color("white")};
  height: 100%;
  &:last-child {
    border-left: 1px solid ${color("border")};
  }
`;

export const RoundedBox = styled.div`
  margin-bottom: 1rem;
  width: 100%;

  display: grid;
  grid-template-columns: minmax(5rem, 30rem) minmax(5rem, auto);

  overflow: hidden;

  border-radius: 1rem;
  border: 2px solid ${color("border")};
`;

export const TabWrapper = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
`;
