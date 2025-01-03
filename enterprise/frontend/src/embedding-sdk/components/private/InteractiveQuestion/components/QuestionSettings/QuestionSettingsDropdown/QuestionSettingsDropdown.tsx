import type { CSSProperties } from "react";

import { InteractiveQuestion } from "embedding-sdk";
import { FLEXIBLE_SIZE_DEFAULT_HEIGHT } from "embedding-sdk/components/public/FlexibleSizeComponent";
import { ActionIcon, Icon, Popover } from "metabase/ui";

export const QuestionSettingsDropdown = ({
  height,
}: {
  height?: CSSProperties["height"];
}) => (
  <Popover position="bottom-end">
    <Popover.Target>
      <ActionIcon>
        <Icon name="gear" />
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown miw="20rem" mah={height ?? FLEXIBLE_SIZE_DEFAULT_HEIGHT}>
      <InteractiveQuestion.QuestionSettings />
    </Popover.Dropdown>
  </Popover>
);
