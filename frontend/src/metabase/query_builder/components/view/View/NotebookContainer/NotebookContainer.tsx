import type { TransitionEventHandler, SyntheticEvent } from "react";
import { useEffect, useState, forwardRef } from "react";
import type { ResizeCallbackData, ResizableBoxProps } from "react-resizable";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { color, darken } from "metabase/lib/colors";
import { useSelector, useDispatch } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { NativeQueryPreviewSidebar } from "metabase/query_builder/components/view/NativeQueryPreviewSidebar";
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

  const { isNativePreviewSidebarOpen, nativePreviewSidebarWidth } =
    useSelector(getUiControls);

  const minNotebookWidth = 640;
  const minSidebarWidth = 428;
  const maxSidebarWidth = windowWidth - minNotebookWidth;
  const sidebarWidth = nativePreviewSidebarWidth || minSidebarWidth;

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
    dispatch(setUIControls({ nativePreviewSidebarWidth: data.size.width }));
  };

  const transformStyle = isOpen ? "translateY(0)" : "translateY(-100%)";

  const Handle = forwardRef<HTMLDivElement, Partial<ResizableBoxProps>>(
    function Handle(props, ref) {
      const handleWidth = 6;
      // 0.5 accounts for the border width of 1px
      const left = rem(-(handleWidth / 2 + 0.5));

      return (
        <Box
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
    },
  );

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

      {isNativePreviewSidebarOpen && windowWidth < 1280 && (
        <Box pos="absolute" inset={0}>
          <NativeQueryPreviewSidebar />
        </Box>
      )}

      {isNativePreviewSidebarOpen && windowWidth >= 1280 && (
        <ResizableBox
          width={sidebarWidth}
          minConstraints={[minSidebarWidth, 0]}
          maxConstraints={[maxSidebarWidth, 0]}
          axis="x"
          resizeHandles={["w"]}
          handle={<Handle />}
          onResizeStop={handleResizeStop}
          style={{ borderLeft: `1px solid ${color("border")}` }}
        >
          <NativeQueryPreviewSidebar />
        </ResizableBox>
      )}
    </Flex>
  );
};
