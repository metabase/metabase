import { Link } from "react-router";
import { t } from "ttag";

import { Button, Group, Icon } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { getTransformQueryUrl } from "../../../../utils/urls";
import { CardSection } from "../CardSection";

export type ManageSectionProps = {
  transform: Transform;
};

export function ManageSection({ transform }: ManageSectionProps) {
  return (
    <CardSection
      label={t`Manage this transform`}
      description={t`Change what this transform generates and where.`}
    >
      <Group px="xl" py="lg">
        <Button leftSection={<Icon name="play" />}>{t`Run now`}</Button>
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
