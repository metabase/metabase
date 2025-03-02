import { InteractiveQuestion } from "embedding-sdk";
import { Center, Icon, Popover } from "metabase/ui";

import { ToolbarButton } from "../util/ToolbarButton";

export const DownloadWidgetDropdown = () => {
  return (
    <Popover>
      <Popover.Target>
        <ToolbarButton
          isHighlighted={false}
          variant="default"
          px="sm"
          label={
            <Center>
              <Icon c="inherit" size={16} name="download" />
            </Center>
          }
        />
      </Popover.Target>
      <Popover.Dropdown>
        <InteractiveQuestion.DownloadWidget></InteractiveQuestion.DownloadWidget>
      </Popover.Dropdown>
    </Popover>
  );
};
