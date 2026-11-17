import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { getUserIsAdmin } from "metabase/current-user";
import type { ViewAsButtonProps } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";

import { ViewAsModal } from "./ViewAsModal";

/**
 * "View as…" on a dashboard or question header: shows this page as another user, in this tab.
 */
export function ViewAsButton({ entityName }: ViewAsButtonProps) {
  const isAdmin = useSelector(getUserIsAdmin);
  const location = useLocation();
  const [opened, setOpened] = useState(false);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <ToolbarButton
        icon="eye"
        aria-label={t`View as…`}
        tooltipLabel={t`View as…`}
        onClick={() => setOpened(true)}
      />
      <ViewAsModal
        opened={opened}
        onClose={() => setOpened(false)}
        path={`${location.pathname}${location.search}${location.hash}`}
        entityName={entityName}
      />
    </>
  );
}
