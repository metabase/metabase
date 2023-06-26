import styled from "@emotion/styled";

export const ClampedDiv = styled.div<{ visibleLines: number }>`
  max-height: ${props =>
    props.visibleLines == null
      ? "unset"
      : `calc(1.5em * ${props.visibleLines})`};
  overflow: hidden;
  line-height: 1.5em;
  font-size: 1em;
  white-space: pre-line;
`;
