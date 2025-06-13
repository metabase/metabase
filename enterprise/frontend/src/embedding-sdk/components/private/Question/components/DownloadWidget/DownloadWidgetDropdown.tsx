import { Question } from "embedding-sdk";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import { useQuestionContext } from "../../context";
import { ToolbarButton } from "../util/ToolbarButton";

/**
 * @expand
 * @category Question
 */
export type QuestionDownloadWidgetDropdownProps = PopoverProps;

/**
 * Provides a button that contains a dropdown that shows the `DownloadWidget`.
 *
 * @function
 * @category Question
 * @param props
 */
export const DownloadWidgetDropdown = ({
  ...popoverProps
}: QuestionDownloadWidgetDropdownProps) => {
  const { withDownloads } = useQuestionContext();
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
        <Question.DownloadWidget w="18rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
