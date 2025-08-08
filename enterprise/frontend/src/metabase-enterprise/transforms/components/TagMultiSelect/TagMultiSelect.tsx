import { type MouseEvent, useState } from "react";
import { jt, t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  ActionIcon,
  Icon,
  MultiSelect,
  SelectItem,
  type SelectItemProps,
  Text,
  Tooltip,
} from "metabase/ui";
import { useListTransformTagsQuery } from "metabase-enterprise/api/transform-tag";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import { CreateTagModal } from "./CreateTagModal";
import { DeleteTagModal } from "./DeleteTagModal";
import S from "./TagMultiSelect.module.css";
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
  const [newTagName, setNewTagName] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<TransformTagId>();
  const { sendSuccessToast } = useMetadataToasts();

  const handleChange = async (value: string[]) => {
    if (value.includes(NEW_VALUE)) {
      setModalType("create");
      setNewTagName(searchValue);
    } else {
      onChange(value.map(getTagId));
    }
  };

  const handleModalClose = () => {
    setModalType(undefined);
    setNewTagName("");
    setSelectedTagId(undefined);
  };

  const handleCreate = (tag: TransformTag) => {
    handleModalClose();
    sendSuccessToast(t`Tag created`);
    onChange([...tagIds, tag.id]);
  };

  const handleUpdate = () => {
    handleModalClose();
    sendSuccessToast(t`Tag renamed`);
  };

  const handleDelete = () => {
    handleModalClose();
    sendSuccessToast(t`Tag deleted`);
  };

  const handleUpdateClick = (tag: TransformTag) => {
    setModalType("update");
    setSelectedTagId(tag.id);
  };

  const handleDeleteClick = (tag: TransformTag) => {
    setModalType("delete");
    setSelectedTagId(tag.id);
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
              onUpdateClick={handleUpdateClick}
              onDeleteClick={handleDeleteClick}
            />
          )
        }
        onChange={handleChange}
        onSearchChange={setSearchValue}
      />
      {modalType === "create" && (
        <CreateTagModal
          initialName={newTagName}
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
    <SelectItem selected={selected} mih="2.25rem">
      <Text c="inherit" lh="inherit">
        {jt`Create ${(<strong key="value">{searchValue}</strong>)}`}
      </Text>
    </SelectItem>
  );
}

type ExistingTagSelectItemProps = SelectItemProps & {
  tag: TransformTag;
  onUpdateClick: (tag: TransformTag) => void;
  onDeleteClick: (tag: TransformTag) => void;
};

function ExistingTagSelectItem({
  tag,
  selected,
  onUpdateClick,
  onDeleteClick,
}: ExistingTagSelectItemProps) {
  const handleUpdateClick = (event: MouseEvent) => {
    event.stopPropagation();
    onUpdateClick(tag);
  };

  const handleDeleteClick = (event: MouseEvent) => {
    event.stopPropagation();
    onDeleteClick(tag);
  };

  return (
    <SelectItem className={S.selectItem} selected={selected} py="xs">
      <Text c="inherit" lh="inherit" flex={1}>
        {tag.name}
      </Text>
      <Tooltip label={t`Rename tag`}>
        <ActionIcon
          className={S.actionIcon}
          c="inherit"
          bg="none"
          onClick={handleUpdateClick}
        >
          <Icon name="pencil_lines" />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t`Delete tag`}>
        <ActionIcon
          className={S.actionIcon}
          c="inherit"
          bg="none"
          onClick={handleDeleteClick}
        >
          <Icon name="trash" />
        </ActionIcon>
      </Tooltip>
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
    return [...options, { value: NEW_VALUE, label: searchValue }];
  }

  return options;
}

function getTagById(
  tags: TransformTag[],
): Record<TransformTagId, TransformTag> {
  return Object.fromEntries(tags.map((tag) => [tag.id, tag]));
}
