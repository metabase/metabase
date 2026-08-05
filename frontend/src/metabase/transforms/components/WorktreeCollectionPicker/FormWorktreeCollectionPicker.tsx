import { useField } from "formik";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { Button, Icon, Input, type InputWrapperProps } from "metabase/ui";
import type { CollectionId, WorktreeId } from "metabase-types/api";

import {
  WorktreeCollectionPickerModal,
  findWorktreeCollectionName,
} from "./WorktreeCollectionPickerModal";

interface FormWorktreeCollectionPickerProps extends InputWrapperProps {
  name: string;
  worktreeId: WorktreeId;
  title?: string;
  placeholder?: string;
}

export function FormWorktreeCollectionPicker({
  className,
  style,
  name,
  worktreeId,
  title,
  placeholder = t`Select a collection`,
  ...rest
}: FormWorktreeCollectionPickerProps) {
  const id = useUniqueId();
  const [{ value }, { error, touched }, { setValue }] =
    useField<CollectionId | null>(name);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const { data: collections = [] } = useListCollectionsTreeQuery({
    namespace: "transforms",
    "exclude-archived": true,
    "worktree-id": worktreeId,
  });

  const selectedName = useMemo(
    () => findWorktreeCollectionName(collections, value) ?? t`Transforms`,
    [collections, value],
  );

  const handleChange = (collectionId: CollectionId | null) => {
    setValue(collectionId);
    setIsPickerOpen(false);
  };

  return (
    <>
      <Input.Wrapper
        className={className}
        style={style}
        label={title}
        labelProps={{ htmlFor: id }}
        error={touched ? error : undefined}
        {...rest}
      >
        <Button
          data-testid="worktree-collection-picker-button"
          id={id}
          onClick={() => setIsPickerOpen(true)}
          fullWidth
          rightSection={<Icon name="ellipsis" />}
          styles={{
            inner: { justifyContent: "space-between" },
            root: { "&:active": { transform: "none" } },
          }}
        >
          {value != null ? selectedName : placeholder}
        </Button>
      </Input.Wrapper>
      {isPickerOpen && (
        <WorktreeCollectionPickerModal
          worktreeId={worktreeId}
          value={value}
          onChange={handleChange}
          onClose={() => setIsPickerOpen(false)}
        />
      )}
    </>
  );
}
