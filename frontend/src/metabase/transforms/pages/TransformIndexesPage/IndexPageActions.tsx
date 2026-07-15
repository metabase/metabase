import { t } from "ttag";

import { Button, Tooltip } from "metabase/ui";

export function IndexPageActions({
  readOnly = false,
  targetTableExists: hasTable,
  handleCreate,
  canCreate,
}: {
  readOnly: boolean | undefined;
  targetTableExists: boolean;
  handleCreate: () => void;
  canCreate: boolean;
}) {
  if (readOnly) {
    return null;
  }

  const createButton = (
    <Button variant="filled" disabled={!canCreate} onClick={handleCreate}>
      {t`Create index`}
    </Button>
  );

  const actions = hasTable ? (
    createButton
  ) : (
    <Tooltip label={t`Run the transform before adding indexes`}>
      {createButton}
    </Tooltip>
  );

  return actions;
}
