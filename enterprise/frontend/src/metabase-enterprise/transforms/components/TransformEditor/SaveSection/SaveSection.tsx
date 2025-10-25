import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Button, Group } from "metabase/ui";

type SaveSectionProps = {
  onSave: () => void;
};

export function SaveSection({ onSave }: SaveSectionProps) {
  return (
    <Group>
      <Button component={Link} to={Urls.transformList()}>
        {t`Cancel`}
      </Button>
      <Button variant="filled" onClick={onSave}>
        {t`Save`}
      </Button>
    </Group>
  );
}
