import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const Panel = styled.section<{ hasLeftBorder?: boolean }>`
  overflow-y: auto;
  background-color: ${color("white")};
  height: 100%;

  ${props =>
    props.hasLeftBorder && `border-left: 1px solid ${color("border")};`}
`;

export const RoundedBox = styled.div<{ twoColumns?: boolean }>`
  margin-bottom: 1rem;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(5rem, 30rem) ${props =>
      props.twoColumns ? "minmax(5rem, auto)" : ""};
  max-width: ${props => (props.twoColumns ? "100%" : "30rem")};
  overflow: hidden;
  border-radius: 1rem;
  border: 2px solid ${color("border")};
`;

export const TabWrapper = styled.main`
  display: grid;
  grid-template-rows: auto 1fr;
  width: calc(min(65rem, 100vw));
`;
