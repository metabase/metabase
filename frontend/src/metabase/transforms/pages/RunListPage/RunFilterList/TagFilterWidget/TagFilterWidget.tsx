import { useDisclosure } from "@mantine/hooks";
import { type FormEvent, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Popover,
  Stack,
} from "metabase/ui";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import {
  FILTER_WIDGET_MAX_HEIGHT,
  FILTER_WIDGET_MIN_WIDTH,
} from "../../../../constants";
import { FilterFieldSet } from "../FilterFieldSet";

type TagFilterWidgetProps = {
  label: string;
  tagIds: TransformTagId[];
  tags: TransformTag[];
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagFilterWidget({
  label,
  tagIds,
  tags,
  onChange,
}: TagFilterWidgetProps) {
  const [isOpened, { toggle, close }] = useDisclosure();

  const handleSubmit = (tagIds: TransformTagId[]) => {
    close();
    onChange(tagIds);
  };

  const handleRemove = () => {
    onChange([]);
  };

  return (
    <Popover opened={isOpened} position="bottom-start" onDismiss={close}>
      <Popover.Target>
        <FilterFieldSet
          label={label}
          icon="label"
          displayValue={getDisplayValue(tagIds, tags)}
          onClick={toggle}
          onRemove={handleRemove}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <TagFilterForm tagIds={tagIds} tags={tags} onSubmit={handleSubmit} />
      </Popover.Dropdown>
    </Popover>
  );
}

function getDisplayValue(tagIds: TransformTagId[], tags: TransformTag[]) {
  const count = tagIds.length;
  switch (count) {
    case 0:
      return null;
    case 1:
      return tags.find((tag) => tag.id === tagIds[0])?.name ?? null;
    default:
      return ngettext(msgid`${count} tag`, `${count} tags`, count);
  }
}

type TagFilterForm = {
  tagIds: TransformTagId[];
  tags: TransformTag[];
  onSubmit: (tagIds: TransformTagId[]) => void;
};

function TagFilterForm({
  tagIds: initialTagIds,
  tags,
  onSubmit,
}: TagFilterForm) {
  const [tagIds, setTagIds] = useState(initialTagIds);
  const isValid = tagIds.length > 0;

  const handleChange = (values: string[]) => {
    setTagIds(values.map(getTagId));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isValid) {
      onSubmit(tagIds);
    }
  };

  return (
    <Box component="form" miw={FILTER_WIDGET_MIN_WIDTH} onSubmit={handleSubmit}>
      {tags.length > 0 ? (
        <Box mah={FILTER_WIDGET_MAX_HEIGHT} style={{ overflow: "auto" }}>
          <Checkbox.Group
            value={tagIds.map(getTagIdValue)}
            onChange={handleChange}
          >
            <Stack p="md">
              {tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  value={getTagIdValue(tag.id)}
                  label={tag.name}
                />
              ))}
            </Stack>
          </Checkbox.Group>
        </Box>
      ) : (
        <Box p="md" c="text-secondary" ta="center">{t`No tags found.`}</Box>
      )}
      <Divider />
      <Group p="md" justify="end">
        <Button type="submit" variant="filled" disabled={!isValid}>
          {initialTagIds.length > 0 ? `Update filter` : `Add filter`}
        </Button>
      </Group>
    </Box>
  );
}

function getTagId(value: string) {
  return parseInt(value, 10);
}

function getTagIdValue(tagId: TransformTagId) {
  return String(tagId);
}
