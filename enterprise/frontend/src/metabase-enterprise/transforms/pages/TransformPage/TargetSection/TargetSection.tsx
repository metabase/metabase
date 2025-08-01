import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import { getTableMetadataUrl } from "metabase-enterprise/transforms/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <CardSection
      label={getSectionLabel(transform.target)}
      description={t`Change what this transform generates and where.`}
    >
      <Group p="lg">
        <Button leftSection={<Icon name="pencil_lines" />}>
          {t`Change target`}
        </Button>
        <EditMetadataButton transform={transform} />
      </Group>
    </CardSection>
  );
}

function getSectionLabel({ type }: TransformTarget) {
  return match(type)
    .with("view", () => t`Generated view`)
    .with("table", () => t`Generated table`)
    .exhaustive();
}

type EditMetadataButtonProps = {
  transform: Transform;
};

function EditMetadataButton({ transform }: EditMetadataButtonProps) {
  if (transform.table == null) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={getTableMetadataUrl(transform.table)}
      leftSection={<Icon name="label" />}
    >
      {getEditButtonLabel(transform.target)}
    </Button>
  );
}

function getEditButtonLabel({ type }: TransformTarget) {
  return match(type)
    .with("view", () => t`Edit this view’s metadata`)
    .with("table", () => t`Edit this table’s metadata`)
    .exhaustive();
}
