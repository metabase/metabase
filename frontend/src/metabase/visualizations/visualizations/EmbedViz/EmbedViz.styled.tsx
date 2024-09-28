import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Button, Textarea } from "metabase/ui";

export const EmbedWrapper = styled.div<{ fade?: boolean }>`
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  pointer-events: ${({ fade }) => (fade ? "none" : "all")};
  opacity: ${({ fade }) => (fade ? 0.25 : 1)};
`;

export const EmbedEditWrapper = styled.div<{ fade?: boolean }>`
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
  pointer-events: ${({ fade }) => (fade ? "none" : "all")};
  opacity: ${({ fade }) => (fade ? 0.25 : 1)};
`;

const interactiveDashcardElementCss = css`
  pointer-events: all;

  * {
    pointer-events: all;
  }
`;

export const StyledInput = styled(Textarea)`
  ${interactiveDashcardElementCss}
`;

export const SaveButton = styled(Button)`
  ${interactiveDashcardElementCss}
`;
