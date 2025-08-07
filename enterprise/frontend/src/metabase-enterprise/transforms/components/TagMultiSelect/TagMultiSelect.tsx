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

type TagMultiSelectProps = {
  tagIds: TransformTagId[];
  onChange: (tagIds: TransformTagId[]) => void;
};

export function TagMultiSelect({ tagIds, onChange }: TagMultiSelectProps) {
  const { data: tags = [] } = useListTransformTagsQuery();
  const tagById = getTagById(tags);
  const [searchValue, setSearchValue] = useState("");
  const [isModalOpened, setIsModalOpened] = useState(false);

  const handleChange = (value: string[]) => {
    if (value.includes(NEW_VALUE)) {
      setIsModalOpened(true);
    } else {
      onChange(value.map(getTagId));
    }
  };

  const handleCreate = (tag: TransformTag) => {
    setIsModalOpened(false);
    onChange([...tagIds, tag.id]);
  };

  const handleModalClose = () => {
    setIsModalOpened(false);
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
            />
          )
        }
        onChange={handleChange}
        onSearchChange={setSearchValue}
      />
      {isModalOpened && (
        <CreateTagModal
          searchValue={searchValue}
          onCreate={handleCreate}
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

type ExistingTagModalType = "create" | "update" | "delete";

type ExistingTagSelectItemProps = SelectItemProps & {
  tag: TransformTag;
};

function ExistingTagSelectItem({ tag, selected }: ExistingTagSelectItemProps) {
  const [modalType, setModalType] = useState<ExistingTagModalType>();
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
