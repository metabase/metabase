import { useDisclosure } from "@mantine/hooks";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
  TextInput,
} from "metabase/ui";
import type { Transform, TransformId } from "metabase-types/api";

import {
  FILTER_WIDGET_MAX_HEIGHT,
  FILTER_WIDGET_MIN_WIDTH,
} from "../../../../constants";
import { FilterFieldSet } from "../FilterFieldSet";

type TransformFilterWidgetProps = {
  transformIds: TransformId[];
  transforms: Transform[];
  onChange: (transformIds: TransformId[]) => void;
};

export function TransformFilterWidget({
  transformIds,
  transforms,
  onChange,
}: TransformFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleSubmit = (transformIds: TransformId[]) => {
    close();
    onChange(transformIds);
  };

  const handleRemove = () => {
    onChange([]);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={t`Transform`}
          icon="string"
          displayValue={getDisplayValue(transformIds, transforms)}
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <TransformFilterForm
          transformIds={transformIds}
          transforms={transforms}
          onSubmit={handleSubmit}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

function getDisplayValue(transformIds: TransformId[], transforms: Transform[]) {
  const count = transformIds.length;
  switch (count) {
    case 0:
      return null;
    case 1:
      return transforms.find((tag) => tag.id === transformIds[0])?.name ?? null;
    default:
      return ngettext(msgid`${count} transform`, `${count} transforms`, count);
  }
}

type TransformFilterFormProps = {
  transformIds: TransformId[];
  transforms: Transform[];
  onSubmit: (transformIds: TransformId[]) => void;
};

function TransformFilterForm({
  transformIds: initialTransformIds,
  transforms,
  onSubmit,
}: TransformFilterFormProps) {
  const [transformIds, setTransformIds] = useState(initialTransformIds);
  const [searchValue, setSearchValue] = useState("");
  const isValid = transformIds.length > 0;

  const filteredTransforms = useMemo(
    () => filterTransforms(transforms, searchValue),
    [transforms, searchValue],
  );

  const handleChange = (values: string[]) => {
    setTransformIds(values.map(getTransformId));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(transformIds);
    }
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value);
  };

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      <Box px="md" pt="md">
        <TextInput
          value={searchValue}
          placeholder={t`Search the list`}
          autoFocus
          onChange={handleSearchChange}
        />
      </Box>
      {filteredTransforms.length > 0 ? (
        <Box mah={FILTER_WIDGET_MAX_HEIGHT} style={{ overflow: "auto" }}>
          <Checkbox.Group
            value={transformIds.map(getTransformIdValue)}
            onChange={handleChange}
          >
            <Stack p="md">
              {filteredTransforms.map((tag) => (
                <Checkbox
                  key={tag.id}
                  value={getTransformIdValue(tag.id)}
                  label={tag.name}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </Box>
      ) : (
        <Box p="md" c="text-secondary" ta="center">
          {t`No transforms found.`}
        </Box>
      )}
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialTransformIds.length > 0 ? `Update filter` : `Add filter`}
        </Button>
      </Group>
    </Box>
  );
}

function getTransformId(value: string) {
  return parseInt(value, 10);
}

function getTransformIdValue(transformId: TransformId) {
  return String(transformId);
}

function filterTransforms(transforms: Transform[], searchValue: string) {
  const searchValueLowerCase = searchValue.toLowerCase();
  return transforms.filter((transform) =>
    transform.name.toLowerCase().includes(searchValueLowerCase),
  );
}
