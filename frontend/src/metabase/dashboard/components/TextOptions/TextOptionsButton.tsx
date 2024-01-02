import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import EntityMenu from "metabase/components/EntityMenu";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";

import { IconContainer } from "./TextOptionsButton.styled";

interface TextOptionsButtonProps {
  onAddMarkdown: () => void;
  onAddHeading: () => void;
  onAddIndicateBtn: () => void;
}

export function TextOptionsButton({
  onAddMarkdown,
  onAddHeading,
  onAddIndicateBtn,
}: TextOptionsButtonProps) {
  const TEXT_OPTIONS = [
    {
      title: t`Heading`,
      action: onAddHeading,
      event: "Dashboard; Add Heading",
    },
    {
      title: t`Text`,
      action: onAddMarkdown,
      event: "Dashboard; Add Markdown Box",
    },
    {
      title: t`Indicate`,
      action: onAddIndicateBtn,
      event: "Dashboard; Add Markdown Bo",
    },
  ];

  return (
    <EntityMenu
      items={TEXT_OPTIONS}
      trigger={
        <DashboardHeaderButton aria-label={t`Add a heading or text box`}>
          <IconContainer>
            <Icon name="string" size={18} />
            <Icon name="chevrondown" size={10} />
          </IconContainer>
        </DashboardHeaderButton>
      }
      minWidth={90}
    />
  );
}
