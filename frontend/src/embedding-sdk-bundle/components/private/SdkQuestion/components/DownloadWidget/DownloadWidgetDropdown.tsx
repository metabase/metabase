import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

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
          isHighlighted={false}
          variant="default"
          px="sm"
          disabled={!withDownloads}
          label={
            <Center>
              <Icon c="inherit" size={16} name="download" />
            </Center>
          }
          data-testid="question-download-widget-button"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DownloadWidget w="18rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
