import { useState } from "react";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  ActionIcon,
  Icon,
  Menu,
  MultiSelect,
  SelectItem,
  type SelectItemProps,
  Text,
} from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api/transform-tag";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import { DeleteTagModal } from "./DeleteTagModal";
import { UpdateTagModal } from "./UpdateTagModal";

type TagMultiSelectProps = {
  tagIds: TransformTagId[];
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [] } = useListTransformTagsQuery();
  const tagById = getTagById(tags);

  const handleChange = (value: string[]) => {
    onChange(value.map(getTagId));
  };

  return (
    <MultiSelect
      value={tagIds.map(getValue)}
      data={tags.map(getTagOption)}
      placeholder={t`Add tags`}
      searchable
      renderOption={(item) => (
        <TagSelectItem
          tag={tagById[getTagId(item.option.value)]}
          selected={item.checked}
        />
      )}
      onChange={handleChange}
    />
  );
}

type TagModalType = "update" | "delete";

type TagSelectItemProps = SelectItemProps & {
  tag: TransformTag;
};

function TagSelectItem({ tag, selected }: TagSelectItemProps) {
  const [modalType, setModalType] = useState<TagModalType>();
  const { sendSuccessToast } = useMetadataToasts();

  const handleUpdateClick = () => {
    setModalType("update");
  };

  const handleDeleteClick = () => {
    setModalType("update");
  };

  const handleUpdateToast = () => {
    sendSuccessToast(t`Tag renamed`);
  };

  const handleDeleteToast = () => {
    sendSuccessToast(t`Tag deleted`);
  };

  const handleClose = () => {
    setModalType(undefined);
  };

  return (
    <SelectItem selected={selected}>
      <Text c="inherit" lh="inherit">
        {tag.name}
      </Text>
      <Menu>
        <Menu.Target>
          <ActionIcon>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="pencil_lines" />}
            onClick={handleUpdateClick}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={handleDeleteClick}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {modalType === "update" && (
        <UpdateTagModal
          tag={tag}
          onUpdate={handleUpdateToast}
          onClose={handleClose}
        />
      )}
      {modalType === "delete" && (
        <DeleteTagModal
          tag={tag}
          onDelete={handleDeleteToast}
          onClose={handleClose}
        />
      )}
    </SelectItem>
  );
}

function getValue(tagId: TransformTagId) {
  return String(tagId);
}

function getTagId(value: string): TransformTagId {
  return parseInt(value, 10);
}

function getTagOption(tag: TransformTag) {
  return { tag, value: getValue(tag.id), label: tag.name };
}

function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}
