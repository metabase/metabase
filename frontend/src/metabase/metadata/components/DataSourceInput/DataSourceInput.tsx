import { Link } from "react-router";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import {
  Button,
  Group,
  Icon,
  Select,
  type SelectProps,
  Stack,
  Text,
} from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
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
  const { data: transform } = useGetTransformQuery(transformId ?? skipToken);

  if (value === "metabase-transform" && !showMetabaseTransform) {
    return (
      <Stack gap="sm">
        <Text
          component="label"
          flex="0 0 auto"
          fw="bold"
          size="md"
        >{t`Data source`}</Text>

        <Group>
          <Button
            component={Link}
            h="auto"
            leftSection={<Icon name="sql" />}
            p={0}
            to={`/bench/transforms/${transformId}`}
            size="xs"
            variant="subtle"
          >
            {transform?.name ?? t`Transform`}
          </Button>
        </Group>
      </Stack>
    );
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
      label={t`Data source`}
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
    { value: "unknown" as const, label: t`No one` },
    { value: "ingested" as const, label: t`Ingested` },
    showMetabaseTransform
      ? { value: "metabase-transform" as const, label: t`Metabase transform` }
      : undefined,
    { value: "transform" as const, label: t`Transform` },
    { value: "source-data" as const, label: t`Source data` },
    { value: "uploaded-data" as const, label: t`Uploaded data` },
  ].filter((option) => option != null);
}
