import { useState } from "react";
import { t } from "ttag";

import type { EmbedMenuProps } from "metabase/dashboard/components/EmbedMenu/types";
import {
  DashboardPublicLinkPopover,
  QuestionPublicLinkPopover,
} from "metabase/dashboard/components/PublicLinkPopover";
import { useSelector } from "metabase/lib/redux";
import { ResourceEmbedButton } from "metabase/public/components/ResourceEmbedButton";
import { getSetting } from "metabase/selectors/settings";

export const NonAdminEmbedMenu = ({
  resource,
  resourceType,
  hasPublicLink,
}: EmbedMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const tooltipLabel = isPublicSharingEnabled
    ? t`Ask your admin to create a public link`
    : t`Public links are disabled`;

  const isDisabled = !isPublicSharingEnabled || !hasPublicLink;

  const target = (
    <ResourceEmbedButton
      hasBackground={resourceType === "dashboard"}
      onClick={() => setIsOpen(!isOpen)}
      disabled={isDisabled}
      tooltip={isDisabled ? tooltipLabel : null}
    />
  );

  return resourceType === "dashboard" ? (
    <DashboardPublicLinkPopover
      dashboard={resource}
      target={target}
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  ) : (
    <QuestionPublicLinkPopover
      question={resource}
      target={target}
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );
};
