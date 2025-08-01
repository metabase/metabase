import { useDisclosure } from "@mantine/hooks";
import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken, useGetDatabaseQuery } from "metabase/api";
import Link from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Divider,
  Group,
  Icon,
  type IconName,
  Loader,
  Text,
} from "metabase/ui";
import { CardSection } from "metabase-enterprise/transforms/components/CardSection";
import {
  getBrowseDatabaseUrl,
  getBrowseSchemaUrl,
  getQueryBuilderUrl,
  getTableMetadataUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform, TransformTarget } from "metabase-types/api";

import { UpdateTargetModal } from "./UpdateTargetModal";

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
        <TargetInfo transform={transform} />
      </Group>
      <Divider />
      <Group p="lg">
        <EditTargetButton transform={transform} />
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

type TargetInfoProps = {
  transform: Transform;
};

function TargetInfo({ transform }: TargetInfoProps) {
  const { source, target, table } = transform;
  const { database: databaseId } = source.query;
  const { data, isLoading } = useGetDatabaseQuery(
    table == null && databaseId != null ? { id: databaseId } : skipToken,
  );
  const database = table?.db ?? data;

  if (isLoading) {
    return <Loader size="sm" />;
  }

  return (
    <Group gap="sm">
      {database != null && (
        <>
          <TargetItemLink
            label={database.name}
            icon="database"
            to={getBrowseDatabaseUrl(database.id)}
          />
          <TargetItemDivider />
        </>
      )}
      {database != null && target.schema !== null && (
        <>
          <TargetItemLink
            label={target.schema}
            icon="folder"
            to={getBrowseSchemaUrl(database.id, target.schema)}
          />
          <TargetItemDivider />
        </>
      )}
      <Group gap="xs">
        <TargetItemLink
          label={target.name}
          icon="table2"
          to={table ? getQueryBuilderUrl(table.id, table.db_id) : undefined}
        />
      </Group>
    </Group>
  );
}

type TargetItemLinkProps = {
  label: string;
  icon: IconName;
  to?: string;
};

function TargetItemLink({ label, icon, to }: TargetItemLinkProps) {
  return (
    <Link className={CS.link} to={to ?? ""} disabled={to == null}>
      <Group gap="xs">
        <Icon name={icon} />
        <Text c="inherit">{label}</Text>
      </Group>
    </Link>
  );
}

function TargetItemDivider() {
  return <Icon name="chevronright" size={8} />;
}

type EditTargetButtonProps = {
  transform: Transform;
};

function EditTargetButton({ transform }: EditTargetButtonProps) {
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleUpdate = () => {
    closeModal();
    sendSuccessToast(t`Transform target updated`);
  };

  return (
    <>
      <Button leftSection={<Icon name="pencil_lines" />} onClick={openModal}>
        {t`Change target`}
      </Button>
      {isModalOpened && (
        <UpdateTargetModal
          transform={transform}
          onUpdate={handleUpdate}
          onCancel={closeModal}
        />
      )}
    </>
  );
}

type EditMetadataButtonProps = {
  transform: Transform;
};

function EditMetadataButton({ transform }: EditMetadataButtonProps) {
  const { table, target } = transform;
  if (table == null) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={getTableMetadataUrl(table.id, table.schema, table.db_id)}
      leftSection={<Icon name="label" />}
    >
      {getEditButtonLabel(target)}
    </Button>
  );
}

function getEditButtonLabel({ type }: TransformTarget) {
  return match(type)
    .with("view", () => t`Edit this view’s metadata`)
    .with("table", () => t`Edit this table’s metadata`)
    .exhaustive();
}
