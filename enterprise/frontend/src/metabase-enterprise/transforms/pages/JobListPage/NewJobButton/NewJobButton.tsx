import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

export function NewJobButton() {
  return (
    <Button variant="filled" leftSection={<Icon name="add" />}>
      {t`Create a job`}
    </Button>
  );
}
