import cx from "classnames";
import { type HTMLAttributes, type Ref, forwardRef } from "react";
import { ResizableBox, type ResizableBoxProps } from "react-resizable";

import CS from "metabase/css/core/index.css";
import {
  Notebook,
  type NotebookProps,
} from "metabase/querying/notebook/components/Notebook";
import { Box, Flex, rem } from "metabase/ui";
import { darken } from "metabase/ui/colors";

type DatasetNotebookProps = NotebookProps & {
  isResizing: boolean;
  onResizeStop: ResizableBoxProps["onResizeStop"];
  resizableBoxProps: Partial<ResizableBoxProps> & { height: number };
};

/**
 * Prevents automatic scroll effect on queries with lots of steps.
 * When overflow is 'scroll' and the notebook is being resized,
 * its height changes and it scrolls automatically.
 * Setting the overflow to "hidden" while resizing fixes that behavior.
 * @link Demo: https://github.com/metabase/metabase/pull/19103#issuecomment-981935878
 */
const getOverflow = (isResizing: boolean) => (isResizing ? "hidden" : "auto");

type HandleProps = HTMLAttributes<HTMLDivElement> & {
  handleAxis?: string;
};

const Handle = forwardRef(function Handle(
  props: HandleProps,
  ref: Ref<HTMLDivElement>,
) {
  const { handleAxis, ...rest } = props;

  return (
    <Flex
      align="center"
      justify="center"
      w="100%"
      h="sm"
      pos="absolute"
      bottom={rem(-4)}
      style={{
        cursor: "row-resize",
      }}
      ref={ref}
      {...rest}
    >
      <Box
        w="6.25rem"
        h="xs"
        style={{
          backgroundColor: darken("border-neutral", 0.03),
          borderRadius: "xs",
        }}
      ></Box>
    </Flex>
  );
});

export function DatasetNotebook({
  isResizing,
  onResizeStop,
  resizableBoxProps,
  ...notebookProps
}: DatasetNotebookProps) {
  return (
    <ResizableBox
      className={cx(CS.borderTop, CS.flex)}
      handle={<Handle />}
      {...resizableBoxProps}
      axis="y"
      onResizeStop={(...args) => {
        resizableBoxProps.onResizeStop?.(...args);
        onResizeStop?.(...args);
      }}
    >
      <Box w="100%" style={{ overflowY: getOverflow(isResizing) }}>
        <Notebook {...notebookProps} hasVisualizeButton={false} />
      </Box>
    </ResizableBox>
  );
}
