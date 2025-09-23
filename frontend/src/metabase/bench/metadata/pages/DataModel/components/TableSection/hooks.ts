import { useElementSize } from "@mantine/hooks";
import { useState } from "react";

const BUTTONS_GAP = 16;
const LOADER_WIDTH = 16;
const FIELD_ORDER_PICKER_WIDTH = 136;

export const useResponsiveButtons = ({
  hasFields,
  isSorting,
  isUpdatingSorting,
}: {
  hasFields: boolean;
  isSorting: boolean;
  isUpdatingSorting: boolean;
}) => {
  const { ref: buttonsContainerRef, width: buttonsContainerWidth } =
    useElementSize();
  const [sortingButtonWidth, setSortingButtonWidth] = useState(0);
  const [syncButtonWidth, setSyncButtonWidth] = useState(0);
  const [doneButtonWidth, setDoneButtonWidth] = useState(0);
  const requiredWidth = getRequiredWidth();
  const isWidthInitialized =
    sortingButtonWidth + syncButtonWidth + doneButtonWidth > 0;
  const showButtonLabel = isWidthInitialized
    ? buttonsContainerWidth >= requiredWidth
    : true;

  function getRequiredWidth() {
    /* keep these conditions in sync with JSX in TableSection */

    let width = 0;

    if (isUpdatingSorting) {
      width += LOADER_WIDTH + BUTTONS_GAP;
    }

    if (isSorting) {
      width += FIELD_ORDER_PICKER_WIDTH + BUTTONS_GAP + doneButtonWidth;
    } else {
      width += syncButtonWidth;

      if (hasFields) {
        width += sortingButtonWidth + BUTTONS_GAP;
      }
    }

    return width;
  }

  return {
    buttonsContainerRef,
    showButtonLabel,
    setDoneButtonWidth,
    setSortingButtonWidth,
    setSyncButtonWidth,
  };
};
