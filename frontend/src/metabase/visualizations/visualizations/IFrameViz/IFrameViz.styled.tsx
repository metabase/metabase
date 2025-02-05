import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Text, type TextProps, Textarea } from "metabase/ui";

export const IFrameWrapper = styled.div<{ fade?: boolean }>`
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  border-radius: var(--default-border-radius);
  overflow: hidden;
`;

export const IFrameEditWrapper = styled.div<{ fade?: boolean }>`
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
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

export const InteractiveText = styled(Text)<TextProps>`
  ${interactiveDashcardElementCss}
`;
