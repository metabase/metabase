import type { SyntheticEvent, TransitionEventHandler } from "react";
import { forwardRef, useEffect, useState } from "react";
import type { ResizableBoxProps, ResizeCallbackData } from "react-resizable";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { NodeBuilder } from "metabase/querying/notebook/components/NodeBuilder";
import { getUnsupportedReason } from "metabase/querying/notebook/components/NodeBuilder/graph";
import {
  Notebook,
  type NotebookProps,
} from "metabase/querying/notebook/components/Notebook";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { Box, Flex, rem } from "metabase/ui";

import { setNotebookNativePreviewSidebarWidth } from "../../../../actions";
import { getUiControls } from "../../../../store/selectors";
import { canShowNativePreview } from "../../ViewHeader/utils";

import { NotebookNativePreview } from "./NotebookNativePreview";
import { QueryPreviewSidebar } from "./QueryPreviewSidebar";

// There must exist some transition time, no matter how short,
// because we need to trigger the 'onTransitionEnd' in the component
const delayBeforeNotRenderingNotebook = 10;

// Defined once at module level: a component created inside render remounts on every render.
const Handle = forwardRef<
  HTMLDivElement,
  Partial<ResizableBoxProps> & {
    onResize?: any; //Mantine and react-resizable have different opinions on what onResize should be
    handleAxis?: string; // undocumented prop https://github.com/react-grid-layout/react-resizable/issues/175
  }
>(function Handle(props, ref) {
  const handleWidth = 10;
  const borderWidth = 1;
  const left = rem(-((handleWidth + borderWidth) / 2));

  const { handleAxis, ...rest } = props;

  return (
    <Box
      data-testid="notebook-native-preview-resize-handle"
      ref={ref}
      {...rest}
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
    if (isOpen) {
      setShouldShowNotebook(isOpen);
    }
  }, [isOpen]);

  const {
    isShowingNotebookNativePreview,
    isShowingNodeBuilder,
    notebookNativePreviewSidebarWidth,
  } = useSelector(getUiControls);
  // The canvas only opens for queries it can hold in full; the toggle is
  // disabled for the rest, and this covers the flag being set some other way.
  const isShowingBuilder =
    isShowingNodeBuilder && getUnsupportedReason(question.query()) == null;

  // The builder's preview also covers the empty canvas, before a database is known.
  const renderNativePreview =
    isShowingNotebookNativePreview &&
    (isShowingBuilder ||
      canShowNativePreview({ question, queryBuilderMode: "notebook" }));

  // The canvas copes with far less room than the step editor, and the range must never be empty.
  const minNotebookWidth = isShowingBuilder ? 360 : 640;
  const minSidebarWidth = isShowingBuilder ? 360 : 428;
  const maxSidebarWidth = Math.max(
    minSidebarWidth,
    windowWidth - minNotebookWidth,
  );
  const sidebarWidth = notebookNativePreviewSidebarWidth || minSidebarWidth;
  const Sidebar = isShowingBuilder
    ? QueryPreviewSidebar
    : NotebookNativePreview;

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

  const shouldShowFullWidthNativePreview = useIsSmallScreen();
  const transformStyle = isOpen ? "translateY(0)" : "translateY(-100%)";

  return (
    <Flex
      pos="absolute"
      inset={0}
      bg="background_page-primary"
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
          style={{
            flex: 1,
            overflowY: isShowingBuilder ? "hidden" : "auto",
            position: "relative",
          }}
        >
          {isShowingBuilder ? (
            <NodeBuilder
              question={question.setType("question")}
              isDirty={isDirty}
              isRunnable={isRunnable}
              isResultDirty={isResultDirty}
              readOnly={readOnly}
              isMetric={question.type() === "metric"}
              updateQuestion={updateQuestion}
              runQuestionQuery={runQuestionQuery}
              setQueryBuilderMode={setQueryBuilderMode}
            />
          ) : (
            <Notebook
              question={question.setType("question")}
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
          )}
        </Box>
      )}

      {renderNativePreview && (
        <>
          {shouldShowFullWidthNativePreview ? (
            <Box pos="absolute" inset={0}>
              <Sidebar />
            </Box>
          ) : (
            <ResizableBox
              width={sidebarWidth}
              minConstraints={[minSidebarWidth, 0]}
              maxConstraints={[maxSidebarWidth, 0]}
              axis="x"
              resizeHandles={["w"]}
              handle={<Handle />}
              onResizeStop={handleResizeStop}
              style={{
                position: "relative",
                borderLeft: "1px solid var(--mb-color-border-neutral)",
                marginInlineStart: "0.25rem",
              }}
            >
              <Sidebar />
            </ResizableBox>
          )}
        </>
      )}
    </Flex>
  );
};
