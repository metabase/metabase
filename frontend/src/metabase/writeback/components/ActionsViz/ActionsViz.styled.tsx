import styled from "@emotion/styled";
import { HorizontalAlignmentValue } from "./types";

function getJustifyContentValue(horizontalAlignment: HorizontalAlignmentValue) {
  return (
    {
      left: "flex-start",
      center: "center",
      right: "flex-end",
    }[horizontalAlignment] || "flex-end"
  );
}

export const Root = styled.div<{
  horizontalAlignment: HorizontalAlignmentValue;
}>`
  display: flex;
  align-items: center;
  justify-content: ${props =>
    getJustifyContentValue(props.horizontalAlignment)};

  gap: 0.5rem;

  height: 100%;
`;
