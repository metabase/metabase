import { t } from "ttag";

import type { DashboardCard, VisualizationSettings } from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import { DashActionButton } from "../DashCardActionButton/DashCardActionButton";

interface Props {
  dashcard: DashboardCard;
  onUpdateVisualizationSettings: (
    settings: Partial<VisualizationSettings>,
  ) => void;
}

export function LinkCardEditButton({
  dashcard,
  onUpdateVisualizationSettings,
}: Props) {
  const entity = dashcard?.visualization_settings?.link?.entity;

  if (!entity || isRestrictedLinkEntity(entity)) {
    return null;
  }

  const handleClick = () => {
    onUpdateVisualizationSettings({
      link: {
        url: entity.name,
      },
    });
  };

  return (
    <DashActionButton tooltip={t`Edit Link`} onClick={handleClick}>
      <DashActionButton.Icon name="pencil" />
    </DashActionButton>
  );
}
