import { InteractiveQuestion } from "embedding-sdk";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";
import { ToolbarButton } from "../util/ToolbarButton";

export const DownloadWidgetDropdown = (popoverProps: PopoverProps) => {
  const { withDownloads } = useInteractiveQuestionContext();
  return (
    <Popover {...popoverProps} disabled={!withDownloads}>
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
        <InteractiveQuestion.DownloadWidget />
      </Popover.Dropdown>
    </Popover>
  );
};
