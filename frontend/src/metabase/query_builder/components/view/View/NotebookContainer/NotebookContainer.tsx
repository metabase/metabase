import type { TransitionEventHandler } from "react";
import { useEffect, useState } from "react";

import { useSelector } from "metabase/lib/redux";
import Notebook from "metabase/query_builder/components/notebook/Notebook";
import { NativeQueryPreviewSidebar } from "metabase/query_builder/components/view/NativeQueryPreviewSidebar";
import { getUiControls } from "metabase/query_builder/selectors";
import { Flex } from "metabase/ui";

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
      bg="white"
      pos="absolute"
      inset={0}
      opacity={isOpen ? 1 : 0}
      style={{
        zIndex: 2,
        overflowY: "auto",
        transform: transformStyle,
        transition: `transform ${delayBeforeNotRenderingNotebook}ms, opacity ${delayBeforeNotRenderingNotebook}ms`,
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      {shouldShowNotebook && <Notebook {...props} />}
      {isNativePreviewSidebarOpen && <NativeQueryPreviewSidebar />}
    </Flex>
  );
};
