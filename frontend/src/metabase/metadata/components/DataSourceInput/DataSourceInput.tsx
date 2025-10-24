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
  transformId?: TransformId | null;
  value: TableDataSource | null | undefined;
  onChange: (value: TableDataSource | null) => void;
}

export const DataSourceInput = ({
  comboboxProps,
  transformId, // TODO handle null
  value,
  onChange,
  onFocus,
  ...props
}: Props) => {
  const { data: transform } = useGetTransformQuery(transformId ?? skipToken);

  if (value === "metabase-transform") {
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
      data={getData(value)}
      label={t`Data source`}
      placeholder={t`Select a data source`}
      value={stringifyValue(value)}
      onChange={(value) => onChange(parseValue(value))}
      {...props}
    />
  );
};

function getData(value: TableDataSource | null | undefined) {
  const data = [
    { value: "ingested", label: t`Ingested` },
    { value: "transform", label: t`Transformation (other tools)` },
    { value: "source-data", label: t`Source data` },
    { value: "uploaded-data", label: t`Uploaded data` },
  ];

  if (value === null) {
    return [{ value: "null", label: t`Unknown` }, ...data];
  }

  return data;
}

function stringifyValue(
  value: TableDataSource | null | undefined,
): string | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return value === null ? "null" : value;
}

function parseValue(value: string): TableDataSource | null {
  return value === "null" ? null : (value as TableDataSource);
}
