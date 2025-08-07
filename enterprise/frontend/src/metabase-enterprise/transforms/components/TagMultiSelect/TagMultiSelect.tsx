import { useState } from "react";
import { jt, t } from "ttag";

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

import { CreateTagModal } from "./CreateTagModal";
import { DeleteTagModal } from "./DeleteTagModal";
import { UpdateTagModal } from "./UpdateTagModal";

const NEW_VALUE = "";

type TagModalType = "create" | "update" | "delete";

type TagMultiSelectProps = {
  tagIds: TransformTagId[];
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [] } = useListTransformTagsQuery();
  const tagById = getTagById(tags);
  const [searchValue, setSearchValue] = useState("");
  const [modalType, setModalType] = useState<TagModalType>();
  const [selectedTagId, setSelectedTagId] = useState<TransformTagId>();
  const { sendSuccessToast } = useMetadataToasts();

  const handleModalOpen = (
    modalType: TagModalType,
    selectedTag?: TransformTag,
  ) => {
    setModalType(modalType);
    setSelectedTagId(selectedTag?.id);
  };

  const handleModalClose = () => {
    setModalType(undefined);
    setSelectedTagId(undefined);
  };

  const handleChange = (value: string[]) => {
    if (value.includes(NEW_VALUE)) {
      handleModalOpen("create");
    } else {
      onChange(value.map(getTagId));
    }
  };

  const handleCreate = (tag: TransformTag) => {
    onChange([...tagIds, tag.id]);
    handleModalClose();
    sendSuccessToast(t`Tag created`);
  };

  const handleUpdate = () => {
    handleModalClose();
    sendSuccessToast(t`Tag renamed`);
  };

  const handleDelete = () => {
    handleModalClose();
    sendSuccessToast(t`Tag deleted`);
  };

  return (
    <>
      <MultiSelect
        value={tagIds.map(getValue)}
        data={getOptions(tags, searchValue)}
        placeholder={t`Add tags`}
        searchValue={searchValue}
        searchable
        renderOption={(item) =>
          item.option.value === NEW_VALUE ? (
            <NewTagSelectItem
              searchValue={searchValue}
              selected={item.checked}
            />
          ) : (
            <ExistingTagSelectItem
              tag={tagById[getTagId(item.option.value)]}
              selected={item.checked}
              onModalOpen={handleModalOpen}
            />
          )
        }
        onChange={handleChange}
        onSearchChange={setSearchValue}
      />
      {modalType === "create" && (
        <CreateTagModal
          initialName={searchValue}
          onCreate={handleCreate}
          onClose={handleModalClose}
        />
      )}
      {modalType === "update" && selectedTagId != null && (
        <UpdateTagModal
          tag={tagById[selectedTagId]}
          onUpdate={handleUpdate}
          onClose={handleModalClose}
        />
      )}
      {modalType === "delete" && selectedTagId != null && (
        <DeleteTagModal
          tag={tagById[selectedTagId]}
          onDelete={handleDelete}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}

type NewTagSelectItemProps = SelectItemProps & {
  searchValue: string;
};

function NewTagSelectItem({ searchValue, selected }: NewTagSelectItemProps) {
  return (
    <SelectItem selected={selected}>
      <Text c="inherit" lh="inherit">
        {jt`Create ${(<strong key="value">{searchValue}</strong>)}`}
      </Text>
    </SelectItem>
  );
}

type ExistingTagSelectItemProps = SelectItemProps & {
  tag: TransformTag;
  onModalOpen: (modalType: TagModalType, selectedTag: TransformTag) => void;
};

function ExistingTagSelectItem({
  tag,
  selected,
  onModalOpen,
}: ExistingTagSelectItemProps) {
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
            onClick={() => onModalOpen("update", tag)}
          >
            {t`Edit`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="trash" />}
            onClick={() => onModalOpen("delete", tag)}
          >
            {t`Delete`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </SelectItem>
  );
}

function getValue(tagId: TransformTagId) {
  return String(tagId);
}

function getTagId(value: string): TransformTagId {
  return parseInt(value, 10);
}

function getOptions(tags: TransformTag[], searchValue: string) {
  const options = tags.map((tag) => ({
    tag,
    value: getValue(tag.id),
    label: tag.name,
  }));

  if (searchValue.length > 0 && tags.every((tag) => tag.name !== searchValue)) {
    return [...options, { value: NEW_VALUE, label: NEW_VALUE }];
  }

  return options;
}

function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}
