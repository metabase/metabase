import { t } from "ttag";

import {
  ViewFooterButton,
  type ViewFooterButtonProps,
} from "metabase/components/ViewFooterButton";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";

export const ViewFooterSharingButton = ({
  onClick,
}: Pick<ViewFooterButtonProps, "onClick">) => {
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  return (
    <ViewFooterButton
      icon="share"
      tooltipLabel={isPublicSharingEnabled ? t`Sharing` : t`Embedding`}
      onClick={onClick}
    />
  );
};
