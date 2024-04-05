import type { TransitionEventHandler } from "react";
import { useEffect, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { NativeQueryPreviewSidebar } from "metabase/query_builder/components/view/NativeQueryPreviewSidebar";
import { getUiControls } from "metabase/query_builder/selectors";
import { Flex, Box } from "metabase/ui";

import NC from "./NotebookContainer.module.css";

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

  useEffect(() => {
    isOpen && setShouldShowNotebook(isOpen);
  }, [isOpen]);

  const { isNativePreviewSidebarOpen } = useSelector(getUiControls);

  const handleTransitionEnd: TransitionEventHandler<HTMLDivElement> = (
    event,
  ): void => {
    if (event.propertyName === "opacity" && !isOpen) {
      setShouldShowNotebook(false);
    }
  };

  const transformStyle = isOpen ? "translateY(0)" : "translateY(-100%)";

  return (
    <Flex
      className={NC.notebookContainer}
      bg="white"
      opacity={isOpen ? 1 : 0}
      style={{
        transform: transformStyle,
        transition: `transform ${delayBeforeNotRenderingNotebook}ms, opacity ${delayBeforeNotRenderingNotebook}ms`,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {shouldShowNotebook && (
        <Box className={NC.main}>
          <Notebook {...props} />
        </Box>
      )}

      {isNativePreviewSidebarOpen && (
        <aside
          className={NC.sqlSidebar}
          data-testid="native-query-preview-sidebar"
        >
          <NativeQueryPreviewSidebar />
        </aside>
      )}
    </Flex>
  );
};
