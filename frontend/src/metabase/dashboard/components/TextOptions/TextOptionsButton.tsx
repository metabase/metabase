import { t } from "ttag";

import Icon from "metabase/components/Icon";
import EntityMenu from "metabase/components/EntityMenu";

import { DashboardHeaderButton } from "metabase/dashboard/containers/DashboardHeader.styled";

import { IconContainer } from "./TextOptionsButton.styled";

interface TextOptionsButtonProps {
  onAddMarkdown: () => void;
  onAddHeading: () => void;
}

export function TextOptionsButton({
  onAddMarkdown,
  onAddHeading,
}: TextOptionsButtonProps) {
  const TEXT_OPTIONS = [
    {
      title: t`Heading`,
      action: () => onAddHeading(),
      event: "Dashboard; Add Heading",
    },
    {
      title: t`Text`,
      action: () => onAddMarkdown(),
      event: "Dashboard; Add Markdown Box",
    },
  ];

  return (
    <EntityMenu
      key="dashboard-add-heading-or-text-button"
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
      tooltip={t`Add a heading or text`}
    />
  );
}
