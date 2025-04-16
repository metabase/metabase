import { InteractiveQuestion } from "embedding-sdk";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";
import { ToolbarButton } from "../util/ToolbarButton";

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
  const { withDownloads } = useInteractiveQuestionContext();
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
        />
      </Popover.Target>
      <Popover.Dropdown>
        <InteractiveQuestion.DownloadWidget w="18rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
