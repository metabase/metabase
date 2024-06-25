import type { TransitionEventHandler, SyntheticEvent } from "react";
import { useEffect, useState, forwardRef } from "react";
import type { ResizeCallbackData, ResizableBoxProps } from "react-resizable";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { useSelector, useDispatch } from "metabase/lib/redux";
import {
  setNotebookNativePreviewSidebarWidth,
  setUIControls,
} from "metabase/query_builder/actions";
import Notebook, {
  type NotebookProps,
} from "metabase/query_builder/components/notebook/Notebook";
import { NotebookNativePreview } from "metabase/query_builder/components/notebook/NotebookNativePreview";
import { getUiControls } from "metabase/query_builder/selectors";
import { Flex, Box, rem } from "metabase/ui";

// There must exist some transition time, no matter how short,
// because we need to trigger the 'onTransitionEnd' in the component
const delayBeforeNotRenderingNotebook = 10;

type NotebookContainerProps = {
  isOpen: boolean;
} & NotebookProps;

export const NotebookContainer = ({
  isOpen,
  updateQuestion,
  reportTimezone,
  readOnly,
  question,
  isDirty,
  isRunnable,
  isResultDirty,
  hasVisualizeButton,
  runQuestionQuery,
  setQueryBuilderMode,
}: NotebookContainerProps) => {
  const [shouldShowNotebook, setShouldShowNotebook] = useState(isOpen);
  const { width: windowWidth } = useWindowSize();

  useEffect(() => {
    isOpen && setShouldShowNotebook(isOpen);
  }, [isOpen]);

  const { isShowingNotebookNativePreview, notebookNativePreviewSidebarWidth } =
    useSelector(getUiControls);

  const borderWidth = 1;
  const sidebarMargin = 4;
  const minNotebookWidth = 640;
  const minSidebarWidth = 428 - borderWidth;
  const maxSidebarWidth =
    windowWidth - minNotebookWidth - borderWidth - sidebarMargin;
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
    Partial<ResizableBoxProps> & {
      onResize?: any; //Mantine and react-resizeable have different opinions on what onResize should be
    }
  >(function Handle(props, ref) {
    const handleWidth = 10;
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
        w={rem(handleWidth)}
        left={left}
        style={{
          zIndex: 5,
          cursor: "ew-resize",
        }}
      ></Box>
    );
  });

  return (
    <Flex
      pos="absolute"
      inset={0}
      bg="bg-white"
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
          <Notebook
            question={question}
            isDirty={isDirty}
            isRunnable={isRunnable}
            isResultDirty={isResultDirty}
            reportTimezone={reportTimezone}
            readOnly={readOnly}
            updateQuestion={updateQuestion}
            runQuestionQuery={runQuestionQuery}
            setQueryBuilderMode={setQueryBuilderMode}
            hasVisualizeButton={hasVisualizeButton}
          />
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
            borderLeft: "1px solid var(--mb-color-border)",
            marginInlineStart: "0.25rem",
          }}
        >
          <NotebookNativePreview />
        </ResizableBox>
      )}
    </Flex>
  );
};
