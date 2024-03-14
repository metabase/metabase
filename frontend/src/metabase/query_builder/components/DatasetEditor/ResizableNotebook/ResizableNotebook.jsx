import cx from "classnames";
import PropTypes from "prop-types";
import { ResizableBox } from "react-resizable";

import CS from "metabase/css/core/index.css";
import { color, darken } from "metabase/lib/colors";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { Flex, Box } from "metabase/ui";

const propTypes = {
  isResizing: PropTypes.bool.isRequired,
  resizableBoxProps: PropTypes.object.isRequired,
  onResizeStop: PropTypes.func.isRequired,
};

/**
 * Prevents automatic scroll effect on queries with lots of steps.
 * When overflow is 'scroll' and the notebook is being resized,
 * its height changes and it scrolls automatically.
 * Setting the overflow to "hidden" while resizing fixes that behavior.
 * @link Demo: https://github.com/metabase/metabase/pull/19103#issuecomment-981935878
 */
const getOverflow = isResizing => (isResizing ? "hidden" : "scroll");

const Handle = () => (
  <Flex
    align="center"
    justify="center"
    w="100%"
    h="8px"
    pos="absolute"
    bottom="-4px"
    style={{
      cursor: "row-resize",
    }}
  >
    <Box
      w="100px"
      h="5px"
      bg={darken(color("border"), 0.03)}
      style={{
        borderRadius: "4px",
      }}
    ></Box>
  </Flex>
);

function ResizableNotebook({
  isResizing,
  onResizeStop,
  resizableBoxProps,
  ...notebookProps
}) {
  return (
    <ResizableBox
      className={cx(CS.borderTop, CS.flex)}
      axis="y"
      handle={<Handle />}
      {...resizableBoxProps}
      onResizeStop={(...args) => {
        resizableBoxProps.onResizeStop(...args);
        onResizeStop(...args);
      }}
    >
      <Box w="100%" style={{ overflowY: getOverflow(isResizing) }}>
        <Notebook {...notebookProps} hasVisualizeButton={false} />
      </Box>
    </ResizableBox>
  );
}

ResizableNotebook.propTypes = propTypes;

export default ResizableNotebook;
