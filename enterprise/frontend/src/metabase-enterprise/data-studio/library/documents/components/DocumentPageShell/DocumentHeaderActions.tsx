import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Document } from "metabase-types/api";

type DocumentHeaderActionsProps = {
  document: Pick<Document, "id">;
};

export function DocumentHeaderActions({
  document,
}: DocumentHeaderActionsProps) {
  return (
    <Button
      component={ForwardRefLink}
      to={Urls.document(document)}
      target="_blank"
      rightSection={<Icon name="external" />}
    >
      {t`Open`}
    </Button>
  );
}
