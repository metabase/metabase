import type { CSSProperties } from "react";

import { InteractiveQuestion } from "embedding-sdk";
import { FLEXIBLE_SIZE_DEFAULT_HEIGHT } from "embedding-sdk/components/public/FlexibleSizeComponent";
import { Center, Icon, Popover } from "metabase/ui";

import { ToolbarButton } from "../../util/ToolbarButton";

export const QuestionSettingsDropdown = ({
  height,
}: {
  height?: CSSProperties["height"];
}) => (
  <Popover position="bottom-end">
    <Popover.Target>
      <ToolbarButton
        isHighlighted={false}
        variant="default"
        px="sm"
        label={
          <Center>
            <Icon c="inherit" size={16} name="gear" />
          </Center>
        }
      />
    </Popover.Target>
    <Popover.Dropdown miw="20rem" mah={height ?? FLEXIBLE_SIZE_DEFAULT_HEIGHT}>
      <InteractiveQuestion.QuestionSettings />
    </Popover.Dropdown>
  </Popover>
);
