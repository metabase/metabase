import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { Button, type ButtonProps, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

type ExploreMeasuresLinkProps = Omit<ButtonProps, "component" | "to"> & {
  table: Table;
};

/** Links to the metric cube viewer; hidden when the table has no measures. */
export function ExploreMeasuresLink({
  table,
  ...buttonProps
}: ExploreMeasuresLinkProps) {
  const hasMeasures = (table.measures ?? []).length > 0;
  if (!hasMeasures || !isConcreteTableId(table.id)) {
    return null;
  }

  return (
    <Button
      component={ForwardRefLink}
      variant="default"
      leftSection={<Icon name="insight" />}
      to={Urls.metricCubeViewer(table.id)}
      {...buttonProps}
    >
      {t`Explore measures`}
    </Button>
  );
}
