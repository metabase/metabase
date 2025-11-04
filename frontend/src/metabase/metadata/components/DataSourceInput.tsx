import { useMemo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import DateTime from "metabase/common/components/DateTime";
import { getScheduleExplanation } from "metabase/lib/cron";
import { Button, Select, type SelectProps, Table, Text } from "metabase/ui";
import {
  useGetTransformQuery,
  useListTransformJobsQuery,
} from "metabase-enterprise/api";
import type { TableDataSource, TransformId } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  showMetabaseTransform?: boolean;
  transformId?: TransformId | null;
  value: TableDataSource | "unknown" | null;
  onChange: (value: TableDataSource | "unknown" | null) => void;
}

export const DataSourceInput = ({
  comboboxProps,
  showMetabaseTransform,
  transformId, // TODO handle null
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  if (value === "metabase-transform" && !showMetabaseTransform && transformId) {
    return <TransformTable transformId={transformId} />;
  }

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={getData(value, showMetabaseTransform)}
      label={t`Source`}
      placeholder={t`Select a data source`}
      value={value}
      onChange={(value) => onChange(value)}
      {...props}
    />
  );
};

function getData(
  value: TableDataSource | "unknown" | null,
  showMetabaseTransform?: boolean,
) {
  return [
    { value: "unknown" as const, label: t`Unknown` },
    { value: "ingested" as const, label: t`Ingested` },
    showMetabaseTransform
      ? { value: "metabase-transform" as const, label: t`Metabase transform` }
      : undefined,
    { value: "transform" as const, label: t`Transform` },
    { value: "source-data" as const, label: t`Source data` },
    { value: "uploaded-data" as const, label: t`Uploaded data` },
  ].filter((option) => option != null);
}

function TransformTable({ transformId }: { transformId: TransformId }) {
  const { data: transform } = useGetTransformQuery(transformId ?? skipToken);

  const { data: jobs = [] } = useListTransformJobsQuery(
    transform?.tag_ids && transform.tag_ids.length > 0
      ? { tag_ids: transform.tag_ids }
      : skipToken,
  );

  const scheduleText = useMemo(() => {
    if (!jobs.length) {
      return null;
    }
    const job = jobs[0];
    return job.schedule ? getScheduleExplanation(job.schedule) : null;
  }, [jobs]);

  return (
    <Table variant="vertical" layout="fixed" withTableBorder>
      <Table.Tbody>
        <Table.Tr>
          <Table.Th w={100}>{t`Data source`}</Table.Th>
          <Table.Td>{t`transform (${transform?.source.type ?? "unknown"})`}</Table.Td>
        </Table.Tr>

        <Table.Tr>
          <Table.Th>{t`Transform`}</Table.Th>
          <Table.Td>
            <Text truncate="end">
              <Button
                component={Link}
                h="auto"
                p={0}
                to={`/bench/transforms/${transformId}`}
                size="xs"
                variant="subtle"
                fz="sm"
              >
                {transform?.name ?? t`Transform`}
              </Button>
            </Text>
          </Table.Td>
        </Table.Tr>
        <Table.Tr>
          <Table.Th>{t`Schedule`}</Table.Th>
          <Table.Td>{scheduleText ? scheduleText : t`Manual only`}</Table.Td>
        </Table.Tr>
        <Table.Tr>
          <Table.Th>{t`Last run`}</Table.Th>
          <Table.Td>
            {transform?.last_run?.end_time ? (
              <DateTime value={transform.last_run.end_time} unit="minute" />
            ) : transform?.last_run?.start_time ? (
              t`Running`
            ) : (
              t`Never`
            )}
          </Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  );
}
