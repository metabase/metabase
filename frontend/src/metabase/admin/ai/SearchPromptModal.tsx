import { useState } from "react";
import { t } from "ttag";

import {
  useCreateSearchPromptMutation,
  useUpdateSearchPromptMutation,
} from "metabase/api";
import { EntityPickerModal } from "metabase/common/components/Pickers";
import type { OmniPickerItem } from "metabase/common/components/Pickers/EntityPicker/types";
import { useToast } from "metabase/common/hooks";
import {
  Box,
  Button,
  Flex,
  Icon,
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
} from "metabase/ui";
import type {
  SearchPromptEntity,
  SearchPromptEntityRef,
} from "metabase-types/api";

import { SearchPromptEntityList } from "./SearchPromptEntityList";

const ENTITY_PICKER_MODELS: OmniPickerItem["model"][] = [
  "dataset",
  "metric",
  "table",
  "card",
  "dashboard",
];

const PROMPT_MAX_LENGTH = 2048;

export function SearchPromptModal({
  searchPrompt,
  onClose,
}: {
  searchPrompt?: SearchPromptEntity;
  onClose: () => void;
}) {
  const isEditing = searchPrompt != null;
  const [sendToast] = useToast();

  const [prompt, setPrompt] = useState(searchPrompt?.prompt ?? "");
  const [entities, setEntities] = useState<SearchPromptEntityRef[]>(
    searchPrompt?.entities ?? [],
  );
  const [verified, setVerified] = useState(searchPrompt?.verified ?? false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const [createSearchPrompt, { isLoading: isCreating }] =
    useCreateSearchPromptMutation();
  const [updateSearchPrompt, { isLoading: isUpdating }] =
    useUpdateSearchPromptMutation();

  const handlePickEntity = (item: OmniPickerItem) => {
    setEntities((current) =>
      current.some((e) => e.model === item.model && e.id === item.id)
        ? current
        : [...current, { model: item.model, id: item.id, name: item.name }],
    );
    setIsPickerOpen(false);
  };

  const handleRemoveEntity = (entity: SearchPromptEntityRef) => {
    setEntities((current) =>
      current.filter((e) => !(e.model === entity.model && e.id === entity.id)),
    );
  };

  const handleSubmit = async () => {
    const { error } = isEditing
      ? await updateSearchPrompt({
          id: searchPrompt.id,
          prompt,
          entities,
          verified,
        })
      : await createSearchPrompt({ prompt, entities, verified });

    if (error) {
      sendToast({
        message: isEditing
          ? t`Error updating search prompt`
          : t`Error creating search prompt`,
        icon: "warning",
        toastColor: "danger",
      });
      return;
    }

    sendToast({
      message: isEditing ? t`Search prompt updated` : t`Search prompt created`,
      icon: "check",
    });
    onClose();
  };

  const isSubmitting = isCreating || isUpdating;
  const canSubmit = prompt.trim().length > 0 && !isSubmitting;

  return (
    <>
      <Modal
        opened
        onClose={onClose}
        title={isEditing ? t`Edit search prompt` : t`New search prompt`}
        size="lg"
      >
        <Stack gap="lg" mt="md">
          <Textarea
            label={t`Prompt`}
            placeholder={t`What might someone search for?`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={PROMPT_MAX_LENGTH}
            minRows={3}
            autosize
            required
          />

          <Box>
            <Text fw="bold" mb="xs">{t`Entities`}</Text>
            <SearchPromptEntityList
              entities={entities}
              onRemove={handleRemoveEntity}
            />
            <Button
              variant="subtle"
              leftSection={<Icon name="add" />}
              mt="sm"
              onClick={() => setIsPickerOpen(true)}
            >
              {t`Add entity`}
            </Button>
          </Box>

          <Switch
            label={t`Verified`}
            description={t`Turn this on once you've reviewed this prompt and its entities.`}
            checked={verified}
            onChange={(event) => setVerified(event.currentTarget.checked)}
          />

          <Flex justify="flex-end" gap="md">
            <Button variant="subtle" onClick={onClose}>{t`Cancel`}</Button>
            <Button
              variant="filled"
              disabled={!canSubmit}
              loading={isSubmitting}
              onClick={handleSubmit}
            >
              {isEditing ? t`Save changes` : t`Create`}
            </Button>
          </Flex>
        </Stack>
      </Modal>

      {isPickerOpen && (
        <EntityPickerModal
          title={t`Pick an entity`}
          models={ENTITY_PICKER_MODELS}
          onChange={handlePickEntity}
          onClose={() => setIsPickerOpen(false)}
          options={{
            hasSearch: true,
            hasRecents: true,
            hasConfirmButtons: false,
          }}
        />
      )}
    </>
  );
}
