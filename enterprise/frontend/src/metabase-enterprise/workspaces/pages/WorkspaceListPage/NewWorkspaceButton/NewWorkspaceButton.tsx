import { Link } from "react-router";
import { t } from "ttag";

import { Button, Icon, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Database } from "metabase-types/api";

export type NewWorkspaceButtonProps = {
  availableDatabases: Database[];
};

export function NewWorkspaceButton({
  availableDatabases,
}: NewWorkspaceButtonProps) {
  const hasAvailableDatabases = availableDatabases.length > 0;

  return (
    <Tooltip
      label={t`There are no databases that support workspaces.`}
      disabled={hasAvailableDatabases}
    >
      {hasAvailableDatabases ? (
        <Button
          component={Link}
          to={Urls.newWorkspace()}
          aria-label={t`Add workspace`}
          leftSection={<Icon name="add" />}
        />
      ) : (
        <Button
          disabled
          aria-label={t`Add workspace`}
          leftSection={<Icon name="add" />}
        />
      )}
    </Tooltip>
  );
}
