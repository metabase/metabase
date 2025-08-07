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
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [] } = useListTransformTagsQuery();
  const [createTag, { isLoading }] = useCreateTransformTagMutation();
  const tagById = getTagById(tags);
  const [searchValue, setSearchValue] = useState("");
  const [modalType, setModalType] = useState<TagModalType>();
  const [selectedTagId, setSelectedTagId] = useState<TransformTagId>();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleSelectionChange = async (value: string[]) => {
    if (value.includes(NEW_VALUE)) {
      const { data: tag } = await createTag({ name: searchValue });
      if (tag) {
        onChange([...tagIds, tag.id]);
      } else {
        sendErrorToast(t`Failed to create a tag`);
      }
    } else {
      onChange(value.map(getTagId));
    }
  };

  const handleTagUpdate = () => {
    sendSuccessToast(t`Tag renamed`);
    setModalType(undefined);
  };

  const handleTagDelete = () => {
    sendSuccessToast(t`Tag deleted`);
    setModalType(undefined);
  };

  const handleModalOpen = (
    modalType: TagModalType,
    selectedTag: TransformTag,
  ) => {
    setModalType(modalType);
    setSelectedTagId(selectedTag.id);
  };

  const handleModalClose = () => {
    setModalType(undefined);
    setSelectedTagId(undefined);
  };

  return (
    <>
      <MultiSelect
        value={tagIds.map(getValue)}
        data={getOptions(tags, searchValue)}
        placeholder={t`Add tags`}
        searchValue={searchValue}
        searchable
        rightSection={isLoading ? <Loader size="sm" /> : undefined}
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
        onChange={handleSelectionChange}
        onSearchChange={setSearchValue}
      />
      {modalType === "update" && selectedTagId != null && (
        <UpdateTagModal
          tag={tagById[selectedTagId]}
          onUpdate={handleTagUpdate}
          onClose={handleModalClose}
        />
      )}
      {modalType === "delete" && selectedTagId != null && (
        <DeleteTagModal
          tag={tagById[selectedTagId]}
          onDelete={handleTagDelete}
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
  onModalOpen: (modalType: TagModalType, selectedTag: TransformTag) => void;
};

function ExistingTagSelectItem({
  tag,
  selected,
  onModalOpen,
}: ExistingTagSelectItemProps) {
  const handleUpdateClick = (event: MouseEvent) => {
    event.stopPropagation();
    onModalOpen("update", tag);
  };

  const handleDeleteClick = (event: MouseEvent) => {
    event.stopPropagation();
    onModalOpen("delete", tag);
  };

  return (
    <SelectItem className={S.item} selected={selected} py="xs">
      <Text c="inherit" lh="inherit" flex={1}>
        {tag.name}
      </Text>
      <Tooltip label={t`Rename tag`}>
        <ActionIcon
          className={S.button}
          c="inherit"
          bg="none"
          onClick={handleUpdateClick}
        >
          <Icon name="pencil_lines" />
        </ActionIcon>
      </Tooltip>
      <Tooltip className={S.button} label={t`Delete tag`}>
        <ActionIcon c="inherit" bg="none" onClick={handleDeleteClick}>
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
