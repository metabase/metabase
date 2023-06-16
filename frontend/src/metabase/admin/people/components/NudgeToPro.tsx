import ExternalLink from "metabase/core/components/ExternalLink";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";

export const NudgeToPro = () => {
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "admin_people" }),
  );
  return (
    <div>
      TODO: Nudge to <ExternalLink href={upgradeUrl}>Pro</ExternalLink>
    </div>
  );
};
