import styled from "@emotion/styled";
import { Stack } from "metabase/ui";

export const CreatedByContainer = styled(Stack)`
  overflow: hidden;
`;

export const CreatedByContentContainer = styled(Stack)`
  overflow-y: auto;

  ::-webkit-scrollbar {
    display: none;
  }
`;
