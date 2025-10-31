import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Button, Group } from "metabase/ui";

type JobActionsProps = {
  isSaving: boolean;
  onSave: () => void;
};

export function JobActions({ isSaving, onSave }: JobActionsProps) {
  return (
    <Group>
      <Button component={Link} to={Urls.transformJobList()}>
        {t`Cancel`}
      </Button>
      <Button variant="filled" disabled={isSaving} onClick={onSave}>
        {t`Save`}
      </Button>
    </Group>
  );
}
