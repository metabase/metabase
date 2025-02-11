import type { CSSProperties } from "react";

import { InteractiveQuestion } from "embedding-sdk";
import { FLEXIBLE_SIZE_DEFAULT_HEIGHT } from "embedding-sdk/components/private/FlexibleSizeComponent";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import ToolbarButtonS from "../../../styles/ToolbarButton.module.css";
import { ToolbarButton } from "../../util/ToolbarButton";

export const QuestionSettingsDropdown = ({
  height,
  ...popoverProps
}: {
  height?: CSSProperties["height"];
} & Omit<PopoverProps, "children"> = {}) => (
  <Popover position="bottom-end" {...popoverProps}>
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
        className={ToolbarButtonS.PrimaryToolbarButton}
      />
    </Popover.Target>
    <Popover.Dropdown miw="20rem" mah={height ?? FLEXIBLE_SIZE_DEFAULT_HEIGHT}>
      <InteractiveQuestion.QuestionSettings />
    </Popover.Dropdown>
  </Popover>
);
