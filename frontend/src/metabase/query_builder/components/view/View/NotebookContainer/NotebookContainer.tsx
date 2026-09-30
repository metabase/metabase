import type { SyntheticEvent, TransitionEventHandler } from "react";
import { useEffect, useState } from "react";
import type { ResizeCallbackData } from "react-resizable";
import { ResizableBox } from "react-resizable";
import { useWindowSize } from "react-use";

import { ResizeHandle } from "metabase/common/components/ResizeHandle";
import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import {
  Notebook,
  type NotebookProps,
} from "metabase/querying/notebook/components/Notebook";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { Box, Flex } from "metabase/ui";

import { setNotebookNativePreviewSidebarWidth } from "../../../../actions";
import { getUiControls } from "../../../../store/selectors";
import { canShowNativePreview } from "../../ViewHeader/utils";

import { NotebookNativePreview } from "./NotebookNativePreview";

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
    if (isOpen) {
      setShouldShowNotebook(isOpen);
    }
  }, [isOpen]);

  const { isShowingNotebookNativePreview, notebookNativePreviewSidebarWidth } =
    useSelector(getUiControls);

  const renderNativePreview =
    isShowingNotebookNativePreview &&
    canShowNativePreview({ question, queryBuilderMode: "notebook" });

  const minNotebookWidth = 640;
  const minSidebarWidth = 428;
  const maxSidebarWidth = windowWidth - minNotebookWidth;
  const sidebarWidth = notebookNativePreviewSidebarWidth || minSidebarWidth;

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
          style={{ flex: 1, overflowY: "auto" }}
        >
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
        </Box>
      )}

      {renderNativePreview && (
        <>
          {shouldShowFullWidthNativePreview ? (
            <Box pos="absolute" inset={0}>
              <NotebookNativePreview />
            </Box>
          ) : (
            <ResizableBox
              width={sidebarWidth}
              minConstraints={[minSidebarWidth, 0]}
              maxConstraints={[maxSidebarWidth, 0]}
              axis="x"
              resizeHandles={["w"]}
              handle={
                <ResizeHandle
                  handleAxis="w"
                  data-testid="notebook-native-preview-resize-handle"
                />
              }
              onResizeStop={handleResizeStop}
              style={{
                borderLeft: "1px solid var(--mb-color-border-neutral)",
                marginInlineStart: "0.25rem",
              }}
            >
              <NotebookNativePreview />
            </ResizableBox>
          )}
        </>
      )}
    </Flex>
  );
};
