import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Button, Group, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

type MeasurePreviewProps = {
  query: Lib.Query;
};

export function MeasurePreview({ query }: MeasurePreviewProps) {
  const previewUrl = Urls.newQuestion({
    dataset_query: Lib.toJsQuery(query),
  });

  return (
    <Group gap="md" ml="auto">
      <Button
        component={Link}
        to={previewUrl}
        target="_blank"
        leftSection={<Icon name="share" size={16} />}
        variant="filled"
        size="compact-sm"
      >{t`Preview`}</Button>
    </Group>
  );
}
