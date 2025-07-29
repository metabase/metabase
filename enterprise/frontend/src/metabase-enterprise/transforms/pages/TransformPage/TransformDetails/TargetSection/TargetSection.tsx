import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/pages/TransformPage/TransformDetails/CardSection";
import { getTableMetadataUrl } from "metabase-enterprise/transforms/utils/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

import { UpdateTargetButton } from "./UpdateTargetButton";

export type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <CardSection
      label={getSectionLabel(transform.target)}
      description={t`Change what this transform generates and where.`}
    >
      <Group px="xl" py="lg">
        <UpdateTargetButton transform={transform} />
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

function getSectionLabel(target: TransformTarget) {
  return match(target.type)
    .with("view", () => t`Generated view`)
    .with("table", () => t`Generated table`)
    .exhaustive();
}
