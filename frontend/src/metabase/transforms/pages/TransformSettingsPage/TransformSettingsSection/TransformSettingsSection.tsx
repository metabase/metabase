import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  useListDatabaseSchemasQuery,
  useUpdateTransformMutation,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { UserInput } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { TransformOwnerAvatar } from "metabase/transforms/components/TransformOwnerAvatar/TransformOwnerAvatar";
import {
  Button,
  Divider,
  Group,
  Icon,
  type IconName,
  Loader,
  Stack,
  Text,
} from "metabase/ui";
import type { Transform, UserId } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { isTransformRunning, sourceDatabaseId } from "../../../utils";

import { UpdateIncrementalSettings } from "./UpdateIncrementalSettings";
import { UpdateTargetModal } from "./UpdateTargetModal";

type TransformSettingsSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

export const TransformSettingsSection = ({
  transform,
  readOnly,
}: TransformSettingsSectionProps) => {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  return (
    <Stack gap="2.5rem">
      <OwnerSection transform={transform} readOnly={readOnly} />
      <TitleSection
        label={t`Transform target`}
        description={t`Change what this transform generates and where.`}
      >
        <Group p="lg">
          <TargetInfo transform={transform} />
        </Group>
        {!readOnly && (
          <>
            <Divider />
            <Group p="lg">
              {!isRemoteSyncReadOnly && (
                <EditTargetButton transform={transform} />
              )}
              <EditMetadataButton transform={transform} />
            </Group>
          </>
        )}
      </TitleSection>
      <UpdateIncrementalSettings transform={transform} readOnly={readOnly} />
    </Stack>
  );
};

type TargetInfoProps = {
  transform: Transform;
};

function TargetInfo({ transform }: TargetInfoProps) {
  const { source, target, table } = transform;
  const databaseId = sourceDatabaseId(source);

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
            to={Urls.dataModel({ databaseId: database.id })}
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
                ? Urls.dataModel({
                    databaseId: database.id,
                    schemaName: target.schema,
                  })
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
          to={table ? Urls.queryBuilderTable(table.id, table.db_id) : undefined}
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
      to={Urls.dataModel({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
      })}
      leftSection={<Icon name="label" aria-hidden />}
      data-testid="table-metadata-link"
    >
      {t`Edit this table's metadata`}
    </Button>
  );
}

type OwnerSectionProps = {
  transform: Transform;
  readOnly?: boolean;
};

function OwnerSection({ transform, readOnly }: OwnerSectionProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const showResultToast = (error: unknown) => {
    if (error) {
      sendErrorToast(t`Failed to update transform owner`);
    } else {
      sendSuccessToast(t`Transform owner updated`);
    }
  };

  const handleOwnerEmailChange = async (email: string | null) => {
    const { error } = await updateTransform({
      id: transform.id,
      owner_email: email,
      owner_user_id: null,
    });
    showResultToast(error);
  };

  const handleOwnerUserIdChange = async (userId: UserId | "unknown" | null) => {
    const { error } = await updateTransform({
      id: transform.id,
      owner_email: null,
      owner_user_id: userId === "unknown" ? null : userId,
    });
    showResultToast(error);
  };

  return (
    <TitleSection
      label={t`Ownership`}
      description={t`Specify who is responsible for this transform.`}
    >
      <Group p="lg">
        {readOnly ? (
          <>
            <Text fw="bold">{t`Owner`}</Text>
            <TransformOwnerAvatar transform={transform} />
          </>
        ) : (
          <UserInput
            email={transform.owner_email ?? null}
            label={t`Owner`}
            userId={
              !transform.owner_email && !transform.owner_user_id
                ? "unknown"
                : (transform.owner_user_id ?? null)
            }
            unknownUserLabel={t`No owner`}
            onEmailChange={handleOwnerEmailChange}
            onUserIdChange={handleOwnerUserIdChange}
          />
        )}
      </Group>
    </TitleSection>
  );
}
