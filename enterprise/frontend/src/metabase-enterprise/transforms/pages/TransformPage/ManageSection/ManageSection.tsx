import { Link } from "react-router";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import { getTransformQueryUrl } from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <CardSection
      label={t`Manage this transform`}
      description={t`Edit the query this transform runs, or delete the transform completely.`}
    >
      <Group p="lg">
        <Button
          component={Link}
          to={getTransformQueryUrl(transform.id)}
          leftSection={<Icon name="pencil_lines" />}
        >
          {t`Edit query`}
        </Button>
        <Button leftSection={<Icon name="trash" />}>{t`Delete`}</Button>
      </Group>
    </CardSection>
  );
}
