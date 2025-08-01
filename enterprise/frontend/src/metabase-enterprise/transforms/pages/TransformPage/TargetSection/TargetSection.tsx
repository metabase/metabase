import { Link } from "react-router";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import { getTableMetadataUrl } from "metabase-enterprise/transforms/urls";
import type { Transform } from "metabase-types/api";

type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <CardSection
      label={t`Generated view`}
      description={t`Change what this transform generates and where.`}
    >
      <Group p="lg">
        <Button leftSection={<Icon name="pencil_lines" />}>
          {t`Change target`}
        </Button>
        {transform.table && (
          <Button
            component={Link}
            to={getTableMetadataUrl(transform.table)}
            leftSection={<Icon name="label" />}
          >
            {t`Change target`}
          </Button>
        )}
      </Group>
    </CardSection>
  );
}
