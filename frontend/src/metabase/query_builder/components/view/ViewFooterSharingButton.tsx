import { t } from "ttag";

import {
  ViewFooterButton,
  type ViewFooterButtonProps,
} from "metabase/components/ViewFooterButton";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const ViewFooterSharingButton = (
  viewFooterButtonProps: Omit<ViewFooterButtonProps, "icon" | "data-testid">,
) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const tooltipLabel =
    viewFooterButtonProps.tooltipLabel ??
    (isPublicSharingEnabled ? t`Sharing` : t`Embedding`);

  return (
    <ViewFooterButton
      icon="share"
      data-testid="resource-embed-button"
      tooltipLabel={tooltipLabel}
      {...viewFooterButtonProps}
    />
  );
};
