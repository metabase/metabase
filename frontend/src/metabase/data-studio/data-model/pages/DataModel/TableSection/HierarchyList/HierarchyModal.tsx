import { useState } from "react";
import { t } from "ttag";

import {
  type Hierarchy,
  createHierarchyId,
} from "metabase/metadata/hierarchies";
import { Button, Modal, Stack, TextInput } from "metabase/ui";
import type { Field } from "metabase-types/api";

import {
  HierarchyDefinitionFields,
  HierarchyOptionsFields,
  getHierarchyDraft,
  isHierarchyDraftComplete,
  toHierarchy,
} from "./HierarchyForm";
import type { LevelColumn } from "./use-level-columns";

type HierarchyModalProps = {
  /** The hierarchy to edit; `null` makes a new one */
  hierarchy: Hierarchy | null;
  fields: Field[];
  columns: LevelColumn[];
  onSave: (hierarchy: Hierarchy) => void;
  onClose: () => void;
};

/**
 * PROTOTYPE: a hierarchy's definition and display options (doc 06). Levels
 * can also be reordered by dragging them in the list.
 */
export function HierarchyModal({
  hierarchy,
  fields,
  columns,
  onSave,
  onClose,
}: HierarchyModalProps) {
  const [name, setName] = useState(hierarchy?.name ?? "");
  const [draft, setDraft] = useState(() => getHierarchyDraft(hierarchy));
  // An unnamed hierarchy takes the placeholder's name, so a name isn't required
  const canSave = isHierarchyDraftComplete(draft, columns);

  return (
    <Modal
      opened
      size="lg"
      title={hierarchy ? t`Edit hierarchy` : t`New hierarchy`}
      onClose={onClose}
    >
      <Stack gap="xl">
        <TextInput
          label={t`Name`}
          description={t`People see this name in Group by and filters.`}
          placeholder={t`New hierarchy`}
          value={name}
          data-autofocus
          onChange={(event) => setName(event.target.value)}
        />
        <HierarchyDefinitionFields
          draft={draft}
          fields={fields}
          columns={columns}
          onChange={setDraft}
        />
        <HierarchyOptionsFields
          draft={draft}
          columns={columns}
          onChange={setDraft}
        />
      </Stack>
      <Modal.Footer>
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          disabled={!canSave}
          onClick={() =>
            onSave(
              toHierarchy(draft, {
                id: hierarchy?.id ?? createHierarchyId(),
                name: name.trim() || t`New hierarchy`,
                columns,
              }),
            )
          }
        >
          {t`Save`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
