import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
} from "metabase/api";
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
import type { Transform } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import {
  getBrowseDatabaseUrl,
  getBrowseSchemaUrl,
  getQueryBuilderUrl,
  getTableMetadataUrl,
} from "../../../urls";
import { isTransformRunning } from "../utils";

import { UpdateTargetModal } from "./UpdateTargetModal";

type TargetSectionProps = {
  transform: Transform;
};

export function TargetSection({ transform }: TargetSectionProps) {
  return (
    <SplitSection
      label={t`Transform target`}
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
    </SplitSection>
  );
}

type TargetInfoProps = {
  transform: Transform;
};

function TargetInfo({ transform }: TargetInfoProps) {
  const { source, target, table } = transform;
  const databaseId =
    source.type === "query"
      ? source.query.database
      : source.type === "python"
        ? source.database
        : undefined;

  const { data: databaseFromApi, isLoading: isDatabaseLoading } =
    useGetDatabaseQuery(
      table == null && databaseId != null ? { id: databaseId } : skipToken,
    );

  const { data: schemas, isLoading: isSchemasLoading } =
    useListDatabaseSchemasQuery(
      databaseId != null
        ? {
            id: databaseId,
            include_hidden: true,
          }
        : skipToken,
    );

  const database = table?.db ?? databaseFromApi;
  const isLoading = isDatabaseLoading || isSchemasLoading;

  if (isLoading) {
    return <Loader size="sm" />;
  }

  const targetSchemaExists = schemas?.some(
    (schemaFromApi) => schemaFromApi === target.schema,
  );

  return (
    <Group gap="sm">
      {database != null && (
        <>
          <TargetItemLink
            label={database.name}
            icon="database"
            to={getBrowseDatabaseUrl(database.id)}
            data-testid="database-link"
          />
          <TargetItemDivider />
        </>
      )}
      {database != null && target.schema !== null && (
        <>
          <TargetItemLink
            label={target.schema}
            icon="folder"
            to={
              table || targetSchemaExists
                ? getBrowseSchemaUrl(database.id, target.schema)
                : undefined
            }
            tooltip={
              table?.schema != null || targetSchemaExists
                ? undefined
                : t`This schema will be created when the transform runs`
            }
            data-testid="schema-link"
          />
          <TargetItemDivider />
        </>
      )}
      <Group gap="xs">
        <TargetItemLink
          label={target.name}
          icon="table2"
          to={table ? getQueryBuilderUrl(table.id, table.db_id) : undefined}
          data-testid="table-link"
        />
      </Group>
    </Group>
  );
}

type TargetItemLinkProps = {
  label: string;
  icon: IconName;
  to?: string;
  tooltip?: string;
  "data-testid"?: string;
};

function TargetItemLink({
  label,
  icon,
  to,
  tooltip,
  "data-testid": dataTestId,
}: TargetItemLinkProps) {
  return (
    <Link
      className={CS.link}
      to={to ?? ""}
      disabled={to == null}
      data-testid={dataTestId}
      tooltip={tooltip}
    >
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
      <Button
        leftSection={<Icon name="pencil_lines" aria-hidden />}
        disabled={isTransformRunning(transform)}
        onClick={openModal}
      >
        {t`Change target`}
      </Button>
      {isModalOpened && (
        <UpdateTargetModal
          transform={transform}
          onUpdate={handleUpdate}
          onClose={closeModal}
        />
      )}
    </>
  );
}

type EditMetadataButtonProps = {
  transform: Transform;
};

function EditMetadataButton({ transform }: EditMetadataButtonProps) {
  const { table } = transform;
  if (table == null) {
    return null;
  }

  return (
    <Button
      component={Link}
      to={getTableMetadataUrl(table.id, table.schema, table.db_id)}
      leftSection={<Icon name="label" aria-hidden />}
      data-testid="table-metadata-link"
    >
      {t`Edit this table’s metadata`}
    </Button>
  );
}
