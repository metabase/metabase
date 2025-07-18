import { useElementSize } from "@mantine/hooks";
import { useState } from "react";

const BUTTONS_GAP = 16;

export const useResponsiveButtons = ({
  isPreviewOpen,
}: {
  isPreviewOpen: boolean;
}) => {
  const { ref: buttonsContainerRef, width: buttonsContainerWidth } =
    useElementSize();
  const [previewButtonWidth, setPreviewButtonWidth] = useState(0);
  const [fieldValuesButtonWidth, setFieldValuesButtonWidth] = useState(0);
  const requiredWidth = getRequiredWidth();
  const isWidthInitialized = previewButtonWidth + fieldValuesButtonWidth > 0;
  const showButtonLabel = isWidthInitialized
    ? buttonsContainerWidth >= requiredWidth
    : true;

  function getRequiredWidth() {
    /* keep these conditions in sync with JSX in FieldSection */

    let width = fieldValuesButtonWidth;

    if (!isPreviewOpen) {
      width += previewButtonWidth + BUTTONS_GAP;
    }

    return width;
  }
  return {
    buttonsContainerRef,
    showButtonLabel,
    setFieldValuesButtonWidth,
    setPreviewButtonWidth,
  };
};
