import type { CSSProperties } from "react";

import { FLEXIBLE_SIZE_DEFAULT_HEIGHT } from "embedding-sdk-bundle/components/private/FlexibleSizeComponent";
import { Center, Icon, Popover, type PopoverProps } from "metabase/ui";

import ToolbarButtonS from "../../../styles/ToolbarButton.module.css";
import { ToolbarButton } from "../../util/ToolbarButton";
import { QuestionSettings } from "../QuestionSettings";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
export type QuestionSettingsDropdownProps = {
  /**
   * Height for the dropdown menu
   */
  height?: CSSProperties["height"];
} & Omit<PopoverProps, "children">;

/**
 * Dropdown button that contains the QuestionSettings component.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const QuestionSettingsDropdown = ({
  height,
  ...popoverProps
}: QuestionSettingsDropdownProps = {}) => (
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
        data-testid="viz-settings-button"
      />
    </Popover.Target>
    <Popover.Dropdown miw="20rem" mah={height ?? FLEXIBLE_SIZE_DEFAULT_HEIGHT}>
      <QuestionSettings maw="20rem" />
    </Popover.Dropdown>
  </Popover>
);
