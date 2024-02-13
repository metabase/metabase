import { t } from "ttag";
import type { MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { DashboardHeaderButton } from "metabase/dashboard/components/DashboardHeader/DashboardHeader.styled";
import { Flex, Tooltip } from "metabase/ui";

export type DashboardEmbedHeaderButtonProps = {
  onClick?: () => void;
  disabled?: boolean;
  hasBackground?: boolean;
  tooltip?: string | null;
};

export const DashboardEmbedHeaderButton = forwardRef(
  function DashboardEmbedHeaderButton(
    {
      onClick,
      disabled = false,
      hasBackground = true,
      tooltip = null,
    }: DashboardEmbedHeaderButtonProps,
    ref: Ref<HTMLButtonElement>,
  ) {
    const isPublicSharingEnabled = useSelector(state =>
      getSetting(state, "enable-public-sharing"),
    );

    const tooltipLabel =
      tooltip ?? (isPublicSharingEnabled ? t`Sharing` : t`Embedding`);

    const onHeaderButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onClick?.();
    };

    return (
      <Tooltip label={tooltipLabel}>
        <Flex>
          <DashboardHeaderButton
            data-disabled={disabled}
            data-testid="dashboard-embed-button"
            icon="share"
            disabled={disabled}
            onClick={onHeaderButtonClick}
            ref={ref}
            hasBackground={hasBackground}
          />
        </Flex>
      </Tooltip>
    );
  },
);
