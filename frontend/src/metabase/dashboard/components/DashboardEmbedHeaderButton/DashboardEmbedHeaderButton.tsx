import { t } from "ttag";
import type { MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { Tooltip, Text, Box } from "metabase/ui";

export type DashboardEmbedHeaderButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
};

const getTooltipLabel = ({
  isPublicSharingEnabled,
  disabled,
}: {
  isPublicSharingEnabled: boolean;
  disabled: boolean;
}) => {
  if (disabled) {
    return t`You must enable Embedding in the settings`;
  }

  return isPublicSharingEnabled ? t`Sharing` : t`Embedding`;
};

export const DashboardEmbedHeaderButton = forwardRef(
  function DashboardEmbedHeaderButton(
    { onClick, disabled = false }: DashboardEmbedHeaderButtonProps,
    ref: Ref<HTMLButtonElement>,
  ) {
    const isPublicSharingEnabled = useSelector(state =>
      getSetting(state, "enable-public-sharing"),
    );

    const tooltipLabel = getTooltipLabel({
      isPublicSharingEnabled,
      disabled,
    });

    const onHeaderButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onClick?.();
    };

    return (
      <Tooltip
        label={
          <Text c="inherit" size="sm" fw={700}>
            {tooltipLabel}
          </Text>
        }
        offset={8}
      >
        <Box>
          <DashboardHeaderButton
            data-disabled={disabled}
            data-testid="dashboard-embed-button"
            icon="share"
            disabled={disabled}
            onClick={onHeaderButtonClick}
            ref={ref}
          />
        </Box>
      </Tooltip>
    );
  },
);
