import { Popover, type PopoverProps } from "metabase/ui";

import { useSdkQuestionContext } from "../../context";
import { ToolbarButton } from "../util/ToolbarButton";

import { DownloadWidget } from "./DownloadWidget";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionDownloadWidgetDropdownProps = PopoverProps;

/**
 * Provides a button that contains a dropdown that shows the `DownloadWidget`.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const DownloadWidgetDropdown = ({
  ...popoverProps
}: InteractiveQuestionDownloadWidgetDropdownProps) => {
  const { withDownloads } = useSdkQuestionContext();
  return (
    <Popover
      {...popoverProps}
      disabled={!withDownloads}
      floatingStrategy="fixed"
      withinPortal={false}
      position="bottom-end"
    >
      <Popover.Target>
        <ToolbarButton
          variant="default"
          px="sm"
          disabled={!withDownloads}
          icon="download"
          data-testid="question-download-widget-button"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DownloadWidget w="18rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
