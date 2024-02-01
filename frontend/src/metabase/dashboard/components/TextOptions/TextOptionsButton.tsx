import { t } from "ttag";

import { Icon } from "metabase/ui";
import EntityMenu from "metabase/components/EntityMenu";

import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";

import { IconContainer } from "./TextOptionsButton.styled";
import { PaletteContextualAction } from "metabase/palette/components/Palette";

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
      paletteLabel: t`Add heading`,
      action: onAddHeading,
      event: "Dashboard; Add Heading",
    },
    {
      title: t`Text`,
      paletteLabel: t`Add text`,
      action: onAddMarkdown,
      event: "Dashboard; Add Markdown Box",
    },
  ];

  return (
    <>
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
      {TEXT_OPTIONS.map(({ paletteLabel, action }) => (
        <PaletteContextualAction name={paletteLabel} action={action} />
      ))}
    </>
  );
}
