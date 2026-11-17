import { useState } from "react";
import { t } from "ttag";

import { ToolbarButton } from "metabase/permissions";

import { ViewAsModal } from "./ViewAsModal";

export function PermissionsToolbarButtons() {
  const [isViewAsOpen, setIsViewAsOpen] = useState(false);

  return (
    <>
      <ToolbarButton
        text={t`View app as…`}
        icon="person"
        onClick={() => setIsViewAsOpen(true)}
      />
      <ViewAsModal
        opened={isViewAsOpen}
        onClose={() => setIsViewAsOpen(false)}
        path="/"
      />
    </>
  );
}
