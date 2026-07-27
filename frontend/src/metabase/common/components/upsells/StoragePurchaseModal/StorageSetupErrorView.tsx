import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useHelpLink } from "metabase/nav/components/AppSwitcher/useHelpLink";
import { Icon } from "metabase/ui";

import { StorageSetupStatusView } from "./StorageSetupStatusView";

export const StorageSetupErrorView = () => {
  const { href } = useHelpLink();

  const supportLink = (
    <ExternalLink key="support" href={href}>
      {t`contact support`}
    </ExternalLink>
  );

  const description = c("{0} is a 'contact support' link")
    .jt`Refresh the page after 1-2 minutes or ${supportLink} if the issue persists.`;

  return (
    <StorageSetupStatusView
      badge={<Icon name="warning_triangle_filled" size={12} color="warning" />}
      title={t`Storage setup didn't finish`}
      description={description}
    />
  );
};
