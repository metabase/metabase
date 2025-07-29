import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { getTableMetadataUrl } from "../../../../utils/urls";
import { CardSection } from "../CardSection";

export type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <CardSection
      label={getLabel(transform)}
      description={t`Change what this transform generates and where.`}
    >
      <Group px="xl" py="lg">
        <Button
          leftSection={<Icon name="pencil_lines" />}
        >{t`Change target`}</Button>
        {transform.table && (
          <Button
            component={Link}
            to={getTableMetadataUrl(transform.table)}
            leftSection={<Icon name="label" />}
          >
            {t`Edit this view’s metadata`}
          </Button>
        )}
      </Group>
    </CardSection>
  );
}

function getLabel(transform: Transform) {
  return match(transform.target.type)
    .with("view", () => t`Generated view`)
    .with("table", () => t`Generated table`)
    .exhaustive();
}
