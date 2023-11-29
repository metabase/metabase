import { t } from "ttag";

import type { DashboardCard, VisualizationSettings } from "metabase-types/api";
import { isRestrictedLinkEntity } from "metabase-types/guards/dashboard";

import { DashCardActionButton } from "../DashCardActionButton/DashCardActionButton";

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
    <DashCardActionButton tooltip={t`Edit Link`} onClick={handleClick}>
      <DashCardActionButton.Icon name="pencil" />
    </DashCardActionButton>
  );
}
