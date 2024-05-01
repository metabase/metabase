import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const Panel = styled.section<{ verticallyOverflows?: boolean }>`
  overflow-y: auto;
  display: flex;
  flex-flow: column nowrap;
  background-color: ${color("white")};
  border-style: solid;
  border-color: ${color("border")};
  border-block-width: 2px;
  border-inline-end-width: 1px;
  border-inline-start-width: 0;
  :first-child {
    border-inline-start-width: 2px;
    border-start-start-radius: 1rem;
    border-end-start-radius: 1rem;
  }
  :last-child {
    border-inline-end-width: 2px;
    ${props =>
      !props.verticallyOverflows &&
      css`
        border-start-end-radius: 1rem;
        border-end-end-radius: 1rem;
      `}
  }
`;

export const TabWrapper = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
`;
