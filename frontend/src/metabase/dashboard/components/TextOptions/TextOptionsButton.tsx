import React, { useState, useCallback } from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { DashboardHeaderButton } from "metabase/dashboard/containers/DashboardHeader.styled";

import { TextChoicesPopover } from "./TextChoicesPopover";
import { IconContainer } from "./TextOptionsButton.styled";

interface TextOptionsButtonProps {
  onAddMarkdown: () => void;
  onAddHeading: () => void;
}

export function TextOptionsButton({
  onAddMarkdown,
  onAddHeading,
}: TextOptionsButtonProps) {
  const [isAddTextPopoverOpen, setIsAddTextPopoverOpen] = useState(false);

  const hideAddTextPopover = useCallback(() => {
    setIsAddTextPopoverOpen(false);
  }, [setIsAddTextPopoverOpen]);
  const showAddTextPopover = useCallback(() => {
    setIsAddTextPopoverOpen(true);
  }, [setIsAddTextPopoverOpen]);

  return (
    <span key="add-a-heading-or-text-box">
      <TippyPopover
        placement="bottom-start"
        onClose={hideAddTextPopover}
        visible={isAddTextPopoverOpen}
        content={
          <TextChoicesPopover
            onAddMarkdown={onAddMarkdown}
            onAddHeading={onAddHeading}
            onClose={hideAddTextPopover}
          />
        }
      >
        <div>
          <Tooltip tooltip={t`Add a heading or text`}>
            <DashboardHeaderButton
              key="add-text"
              aria-label={t`Add a text box`}
              onClick={showAddTextPopover}
              data-metabase-event="Dashboard;Add Heading or Text Box"
            >
              <IconContainer>
                <Icon name="string" size={18} />
                <Icon name="chevrondown" size={10} />
              </IconContainer>
            </DashboardHeaderButton>
          </Tooltip>
        </div>
      </TippyPopover>
    </span>
  );
}
