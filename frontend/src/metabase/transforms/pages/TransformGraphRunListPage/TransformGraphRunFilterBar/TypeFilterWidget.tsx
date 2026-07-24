import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { FILTER_WIDGET_MIN_WIDTH } from "metabase/transforms/constants";
import { FilterFieldSet } from "metabase/transforms/pages/RunListPage/RunFilterBar/FilterFieldSet";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
} from "metabase/ui";
import {
  TRANSFORM_GRAPH_RUN_TYPES,
  type TransformGraphRunType,
} from "metabase-types/api";

export function formatGraphRunType(type: TransformGraphRunType): string {
  switch (type) {
    case "job":
      return t`Job`;
    case "dag":
      return t`Upstream / downstream`;
    case "transform":
      return t`Single transformation`;
  }
}

function isTransformGraphRunType(
  value: string,
): value is TransformGraphRunType {
  return TRANSFORM_GRAPH_RUN_TYPES.some((type) => type === value);
}

type TypeFilterWidgetProps = {
  types: TransformGraphRunType[];
  onChange: (types: TransformGraphRunType[]) => void;
};

export function TypeFilterWidget({ types, onChange }: TypeFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleRemove = () => {
    onChange([]);
  };

  const handleSubmit = (nextTypes: TransformGraphRunType[]) => {
    close();
    onChange(nextTypes);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={t`Type`}
          icon="list"
          displayValue={getDisplayValue(types)}
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <TypeFilterForm types={types} onSubmit={handleSubmit} />
      </Popover.Dropdown>
    </Popover>
  );
}

function getDisplayValue(types: TransformGraphRunType[]) {
  if (types.length === 0) {
    return null;
  }
  return types.map(formatGraphRunType).join(", ");
}

type TypeFilterFormProps = {
  types: TransformGraphRunType[];
  onSubmit: (types: TransformGraphRunType[]) => void;
};

function TypeFilterForm({
  types: initialTypes,
  onSubmit,
}: TypeFilterFormProps) {
  const [types, setTypes] = useState(initialTypes);
  const isValid = types.length > 0;

  const handleChange = (values: string[]) => {
    setTypes(values.filter(isTransformGraphRunType));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(types);
    }
  };

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      <Checkbox.Group value={types} onChange={handleChange}>
        <Stack p="md">
          {TRANSFORM_GRAPH_RUN_TYPES.map((type) => (
            <Checkbox
              key={type}
              value={type}
              label={formatGraphRunType(type)}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialTypes.length > 0 ? t`Update filter` : t`Add filter`}
        </Button>
      </Group>
    </Box>
  );
}
