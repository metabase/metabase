import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useListDatabaseSchemasQuery } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { NameDescriptionInput } from "metabase/metadata/components/NameDescriptionInput";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  Button,
  Card,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInputBlurChange,
  Title,
} from "metabase/ui";
import {
  useDeleteTransformMutation,
  useExecuteTransformMutation,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { tableMetadataUrl, transformListUrl } from "../../../utils/urls";

import { SCHEDULE_OPTIONS } from "./constants";

type TransformSettingsProps = {
  transform: Transform;
};

export function TransformSettings({ transform }: TransformSettingsProps) {
  const databaseId = transform.source?.query?.database;
  const { data: schemas = [] } = useListDatabaseSchemasQuery(
    databaseId != null ? { id: databaseId } : skipToken,
  );
  const [updateTransform] = useUpdateTransformMutation();
  const [executeTransform, { isLoading: isExecuting }] =
    useExecuteTransformMutation();
  const [deleteTransform, { isLoading: isDeleting }] =
    useDeleteTransformMutation();
  const dispatch = useDispatch();

  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          name: transform.name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      description: description.length === 0 ? null : description,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform description`);
    } else {
      sendSuccessToast(t`Transform description updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          description: transform.description,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleTargetTableChange = async (table: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      target: {
        ...transform.target,
        table,
      },
    });

    if (error) {
      sendErrorToast(t`Failed to update transform table`);
    } else {
      sendSuccessToast(t`Transform table updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          target: transform.target,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleTargetSchemaChange = async (schema: string | null) => {
    if (schema == null) {
      return;
    }

    const { error } = await updateTransform({
      id: transform.id,
      target: {
        ...transform.target,
        schema,
      },
    });

    if (error) {
      sendErrorToast(t`Failed to update transform table schema`);
    } else {
      sendSuccessToast(t`Transform table schema updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          target: transform.target,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleScheduleChange = async (schedule: string | null) => {
    const { error } = await updateTransform({
      id: transform.id,
      schedule,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform schedule`);
    } else {
      sendSuccessToast(t`Transform schedule updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          schedule: transform.schedule,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleExecute = async () => {
    const { error } = await executeTransform(transform.id);

    if (error) {
      sendErrorToast("Failed to run transform");
    } else {
      sendSuccessToast("Transform run successfully");
    }
  };

  const handleDelete = async () => {
    const { error } = await deleteTransform(transform.id);

    if (error) {
      sendErrorToast("Failed to delete transform");
    } else {
      sendSuccessToast("Transform deleted");
      dispatch(push(transformListUrl()));
    }
  };

  return (
    <Stack flex={1} p="xl" align="center">
      <Stack gap="lg" w="100%" maw="50rem" data-testid="transform-section">
        <NameDescriptionInput
          name={transform.name}
          nameIcon="refresh_downstream"
          nameMaxLength={254}
          namePlaceholder={t`Give this transform a name`}
          description={transform.description ?? ""}
          descriptionPlaceholder={t`Give this transform a description`}
          onNameChange={handleNameChange}
          onDescriptionChange={handleDescriptionChange}
        />
        <Group justify="end">
          <Button
            loading={isExecuting}
            leftSection={<Icon name="play" />}
            onClick={handleExecute}
          >
            {t`Run now`}
          </Button>
          {transform.table && (
            <Button component={Link} to={tableMetadataUrl(transform.table)}>
              {t`Edit metadata`}
            </Button>
          )}
        </Group>
        <Card p="xl" shadow="none" withBorder>
          <Stack gap="xl">
            <Group justify="space-between" align="start">
              <Stack gap="sm">
                <Title order={4}>{t`Generated table settings`}</Title>
                <Text c="text-secondary">{t`Each transform creates a table in this database.`}</Text>
              </Stack>
              {transform.table && (
                <Button
                  component={Link}
                  target="_blank"
                  to={`/question#?db=${transform.table.db_id}&table=${transform.table.id}`}
                  leftSection={<Icon name="external" />}
                >
                  {t`Go to this table`}
                </Button>
              )}
            </Group>
            <TextInputBlurChange
              label={t`What should the generated table be called in the database?`}
              value={transform.target.table}
              onBlurChange={(event) =>
                handleTargetTableChange(event.target.value)
              }
            />
            <Select
              label={t`The schema where this table should go`}
              value={transform.target.schema}
              data={schemas}
              onChange={handleTargetSchemaChange}
            />
          </Stack>
        </Card>
        <Card p="xl" shadow="none" withBorder>
          <Stack gap="xl">
            <Title order={4}>{t`Schedule`}</Title>
            <Select
              label={t`How often should this transform run?`}
              data={SCHEDULE_OPTIONS}
              value={transform.schedule}
              placeholder={t`Never, I'll do this manually if I need to`}
              clearable
              onChange={handleScheduleChange}
            />
          </Stack>
        </Card>
        <Group justify="end">
          <Button loading={isDeleting} onClick={handleDelete}>
            {t`Delete`}
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}
