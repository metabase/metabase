import { InteractiveQuestion } from "embedding-sdk";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";
import { ToolbarButton } from "../util/ToolbarButton";

export const DownloadWidgetDropdown = (
  popoverProps: Omit<PopoverProps, "children">,
) => {
  const { withDownloads } = useInteractiveQuestionContext();
  return (
    <Popover
      {...popoverProps}
      disabled={!withDownloads}
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
