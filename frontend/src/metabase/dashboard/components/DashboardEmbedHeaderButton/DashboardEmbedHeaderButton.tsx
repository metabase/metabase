import { t } from "ttag";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { Tooltip, Text } from "metabase/ui";

export type DashboardEmbedHeaderButtonProps = {
  onClick?: () => void;
};

export const DashboardEmbedHeaderButton = ({
  onClick,
}: DashboardEmbedHeaderButtonProps) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const tooltipLabel = isPublicSharingEnabled ? t`Sharing` : t`Embedding`;

  return (
    <Tooltip
      label={
        <Text c="inherit" size="sm" fw={700}>
          {tooltipLabel}
        </Text>
      }
      offset={8}
    >
      <DashboardHeaderButton
        key="dashboard-embed-button"
        icon="share"
        onClick={onClick}
      />
    </Tooltip>
  );
};
