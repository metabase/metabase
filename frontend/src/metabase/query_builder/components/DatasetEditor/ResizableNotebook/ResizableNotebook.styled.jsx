import styled from "@emotion/styled";
import { color, darken } from "metabase/lib/colors";

export const NotebookContainer = styled.div`
  width: 100%;
  overflow-y: ${props => {
    // Prevents automatic scroll effect on queries with lots of steps.
    // When overflow is 'scroll' and the notebook is being resized,
    // it's height changes and it scrolls automatically.
    // Setting the overflow to "hidden" while resizing fixes that behavior
    // Demo: https://github.com/metabase/metabase/pull/19103#issuecomment-981935878
    return props.isResizing ? "hidden" : "scroll";
  }};
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

const HandleContent = styled.div`
  width: 100px;
  height: 5px;
  border-radius: 4px;
  background-color: ${darken(color("border"), 0.03)};
`;

export function Handle(props) {
  return (
    <HandleContainer {...props}>
      <HandleContent />
    </HandleContainer>
  );
}
