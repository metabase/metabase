import styled from "@emotion/styled";
import type { ResizableBoxProps } from "react-resizable";
import { ResizableBox } from "react-resizable";

import QueryBuilderS from "metabase/css/query_builder.module.css";
import { darken } from "metabase/lib/colors";

export const NativeQueryEditorRoot = styled.div`
  width: 100%;
  background-color: var(--mb-color-bg-light);

  .${QueryBuilderS.GuiBuilderData} {
    border-right: none;
  }
`;

export const DragHandleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 8px;
  position: absolute;
  bottom: -4px;
  cursor: row-resize;
`;

export const DragHandle = styled.div`
  width: 100px;
  height: 5px;
  background-color: ${() => darken("border", 0.03)};
  border-radius: 4px;
`;

export const StyledResizableBox = styled(ResizableBox)<
  ResizableBoxProps & {
    isOpen: boolean;
  }
>`
  display: ${props => (props.isOpen ? "flex" : "none")};
  border-top: 1px solid var(--mb-color-border);
`;
