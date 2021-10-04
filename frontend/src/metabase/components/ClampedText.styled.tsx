import styled from "styled-components";

export const ClampedDiv = styled.div<{visibleLines: number | null}>`
  max-height: ${props =>
    props.visibleLines == null
      ? "unset"
      : `calc(1.5em * ${props.visibleLines})`};
  overflow: hidden;
  line-height: 1.5em;
  font-size: 1em;
  white-space: pre-line;
`;
