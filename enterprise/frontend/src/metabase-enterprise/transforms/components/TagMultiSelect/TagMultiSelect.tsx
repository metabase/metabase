import { type MouseEvent, useState } from "react";
import { jt, t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  ActionIcon,
  Icon,
  Loader,
  MultiSelect,
  SelectItem,
  type SelectItemProps,
  Text,
  Tooltip,
} from "metabase/ui";
import {
  useCreateTransformTagMutation,
  useListTransformTagsQuery,
} from "metabase-enterprise/api/transform-tag";
import type { TransformTag, TransformTagId } from "metabase-types/api";

import { DeleteTagModal } from "./DeleteTagModal";
import S from "./TagMultiSelect.module.css";
import { UpdateTagModal } from "./UpdateTagModal";

const NEW_VALUE = "";

type TagModalType = "update" | "delete";

type TagMultiSelectProps = {
  tagIds: TransformTagId[];
  onChange: (tagIds: TransformTagId[], undoable?: boolean) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [], isLoading } = useListTransformTagsQuery();
  const [createTag, { isLoading: isCreating }] =
    useCreateTransformTagMutation();
  const tagById = getTagById(tags);
  const [searchValue, setSearchValue] = useState("");
  const [modalType, setModalType] = useState<TagModalType>();
  const [selectedTagId, setSelectedTagId] = useState<TransformTagId>();
  const { sendErrorToast } = useMetadataToasts();

  const handleCreate = async () => {
    if (isCreating) {
      return;
    }
    const { data: tag } = await createTag({ name: searchValue });
    if (!tag) {
      sendErrorToast(t`Failed to create a tag`);
    } else {
      onChange([...tagIds, tag.id], true);
    }
  };

  const handleChange = async (value: string[]) => {
    if (value.includes(NEW_VALUE)) {
      handleCreate();
    } else {
      onChange(value.map(getTagId), true);
    }
  };

  const handleModalClose = () => {
    setModalType(undefined);
    setSelectedTagId(undefined);
  };

  const handleUpdateClick = (tag: TransformTag) => {
    setModalType("update");
    setSelectedTagId(tag.id);
  };

  const handleUpdate = () => {
    handleModalClose();
  };

  const handleDeleteClick = (tag: TransformTag) => {
    setModalType("delete");
    setSelectedTagId(tag.id);
  };

  const handleDelete = () => {
    handleModalClose();
    onChange(
      tagIds.filter((tagId) => tagId !== selectedTagId),
      false,
    );
  };

  return (
    <>
      <MultiSelect
        value={tagIds.map(getValue)}
        data={getOptions(tags, searchValue)}
        placeholder={t`Add tags`}
        searchValue={searchValue}
        searchable
        rightSection={
          isLoading || isCreating ? <Loader size="sm" /> : undefined
        }
        nothingFoundMessage={getNotFoundMessage(tags, tagIds, searchValue)}
        renderOption={(item) =>
          item.option.value === NEW_VALUE ? (
            <NewTagSelectItem
              searchValue={searchValue}
              selected={item.checked}
              onCreate={handleCreate}
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
        aria-label={t`Tags`}
        onChange={handleChange}
        onSearchChange={setSearchValue}
      />
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
  onCreate: () => void;
};

function NewTagSelectItem({
  searchValue,
  selected,
  onCreate,
}: NewTagSelectItemProps) {
  const handleClick = (event: MouseEvent) => {
    // prevent item selection
    event.stopPropagation();
    onCreate();
  };

  return (
    <SelectItem selected={selected} mih="2.25rem" onClick={handleClick}>
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
    // prevent item selection
    event.stopPropagation();
    onUpdateClick(tag);
  };

  const handleDeleteClick = (event: MouseEvent) => {
    // prevent item selection
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
          aria-label={t`Rename tag`}
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
          aria-label={t`Delete tag`}
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

function getNotFoundMessage(
  tags: TransformTag[],
  tagIds: TransformTagId[],
  searchValue: string,
) {
  if (tags.length === 0) {
    return t`No tags yet`;
  }
  if (tags.length === tagIds.length) {
    return t`All tags selected`;
  }
  if (tags.some((tag) => tag.name === searchValue)) {
    return t`A tag with that name already exists.`;
  }
  return t`No tags found`;
}
