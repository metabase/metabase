import React from "react";
import styled from "styled-components";
import { color, darken } from "metabase/lib/colors";
import { forwardRefToInnerRef } from "metabase/styled-components/utils";

export const NotebookContainer = styled.div`
  width: 100%;
  overflow-y: scroll;
`;

const HandleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;

  height: 8px;
  width: 100%;

  position: absolute;
  bottom: -4px;

  cursor: row-resize;
`;

const HandleContainerWithRef = forwardRefToInnerRef(HandleContainer);

const HandleContent = styled.div`
  width: 100px;
  height: 5px;
  border-radius: 4px;
  background-color: ${darken(color("border"), 0.03)};
`;

export function Handle(props) {
  return (
    <HandleContainerWithRef {...props}>
      <HandleContent />
    </HandleContainerWithRef>
  );
}
