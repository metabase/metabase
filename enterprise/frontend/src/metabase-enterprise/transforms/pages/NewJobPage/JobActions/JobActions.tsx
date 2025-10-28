import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Button, Group } from "metabase/ui";

type JobActionsProps = {
  iSaving: boolean;
  onSave: () => void;
};

export function JobActions({ iSaving, onSave }: JobActionsProps) {
  return (
    <Group>
      <Button component={Link} to={Urls.transformJobList()}>
        {t`Cancel`}
      </Button>
      <Button variant="filled" disabled={iSaving} onClick={onSave}>
        {t`Save`}
      </Button>
    </Group>
  );
}
