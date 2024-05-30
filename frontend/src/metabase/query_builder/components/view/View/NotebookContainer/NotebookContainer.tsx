import type { TransitionEventHandler, SyntheticEvent } from "react";
import { useEffect, useState, forwardRef } from "react";
import type { ResizeCallbackData, ResizableBoxProps } from "react-resizable";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { color, darken } from "metabase/lib/colors";
import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  setNotebookNativePreviewSidebarWidth,
  setUIControls,
} from "metabase/query_builder/actions";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { NotebookNativePreview } from "metabase/query_builder/components/notebook/NotebookNativePreview";
import { getUiControls } from "metabase/query_builder/selectors";
import { Flex, Box, rem } from "metabase/ui";

// There must exist some transition time, no matter how short,
// because we need to trigger the 'onTransitionEnd' in the component
const delayBeforeNotRenderingNotebook = 10;

interface NotebookContainerProps {
  isOpen: boolean;
}

export const NotebookContainer = ({
  isOpen,
  ...props
}: NotebookContainerProps) => {
  const [shouldShowNotebook, setShouldShowNotebook] = useState(isOpen);
  const { width: windowWidth } = useWindowSize();

  useEffect(() => {
    isOpen && setShouldShowNotebook(isOpen);
  }, [isOpen]);

  const { isShowingNotebookNativePreview, notebookNativePreviewSidebarWidth } =
    useSelector(getUiControls);

  const minNotebookWidth = 640;
  const minSidebarWidth = 428;
  const maxSidebarWidth = windowWidth - minNotebookWidth;
  const sidebarWidth = notebookNativePreviewSidebarWidth || minSidebarWidth;
  const windowBreakpoint = 1280;

  const handleTransitionEnd: TransitionEventHandler<HTMLDivElement> = (
    event,
  ): void => {
    if (event.propertyName === "opacity" && !isOpen) {
      setShouldShowNotebook(false);
    }
  };

  const dispatch = useDispatch();
  const handleResizeStop = (
    _event: SyntheticEvent,
    data: ResizeCallbackData,
  ) => {
    const { width } = data.size;

    dispatch(setUIControls({ notebookNativePreviewSidebarWidth: width }));
    dispatch(setNotebookNativePreviewSidebarWidth(width));
  };

  const transformStyle = isOpen ? "translateY(0)" : "translateY(-100%)";

  const Handle = forwardRef<
    HTMLDivElement,
    Partial<ResizableBoxProps> & { onResize: any } //Mantine and react-resizeable have different opinions on what onResize should be
  >(function Handle(props, ref) {
    const handleWidth = 6;
    const borderWidth = 1;
    const left = rem(-((handleWidth + borderWidth) / 2));

    return (
      <Box
        data-testid="notebook-native-preview-resize-handle"
        ref={ref}
        {...props}
        pos="absolute"
        top={0}
        bottom={0}
        m="auto 0"
        h={rem(100)}
        w={rem(handleWidth)}
        left={left}
        bg={darken("border", 0.03)}
        style={{
          zIndex: 5,
          cursor: "ew-resize",
          borderRadius: rem(8),
        }}
      ></Box>
    );
  });

  return (
    <Flex
      pos="absolute"
      inset={0}
      bg={color("white")}
      opacity={isOpen ? 1 : 0}
      style={{
        transform: transformStyle,
        transition: `transform ${delayBeforeNotRenderingNotebook}ms, opacity ${delayBeforeNotRenderingNotebook}ms`,
        zIndex: 2,
        overflowY: "hidden",
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {shouldShowNotebook && (
        <Box
          miw={{ lg: minNotebookWidth }}
          style={{ flex: 1, overflowY: "auto" }}
        >
          <Notebook {...props} />
        </Box>
      )}

      {isShowingNotebookNativePreview && windowWidth < windowBreakpoint && (
        <Box pos="absolute" inset={0}>
          <NotebookNativePreview />
        </Box>
      )}

      {isShowingNotebookNativePreview && windowWidth >= windowBreakpoint && (
        <ResizableBox
          width={sidebarWidth}
          minConstraints={[minSidebarWidth, 0]}
          maxConstraints={[maxSidebarWidth, 0]}
          axis="x"
          resizeHandles={["w"]}
          handle={<Handle />}
          onResizeStop={handleResizeStop}
          style={{
            borderLeft: `1px solid ${color("border")}`,
            marginInlineStart: "0.25rem",
          }}
        >
          <NotebookNativePreview />
        </ResizableBox>
      )}
    </Flex>
  );
};
