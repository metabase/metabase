import { useEffect, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Box,
  Button,
  Checkbox,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

export interface AddEntitiesModalItem {
  key: string;
  label: string;
  description?: string | null;
  /** Already in the research plan — shown checked + disabled (add-only). */
  alreadyAdded: boolean;
}

export interface AddEntitiesModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  items: AddEntitiesModalItem[];
  isLoading?: boolean;
  error?: unknown;
  /** Receives only the newly-checked keys (existing items can't be unchecked). */
  onAdd: (keys: string[]) => void;
}

export function AddEntitiesModal({
  opened,
  onClose,
  title,
  searchPlaceholder,
  search,
  onSearchChange,
  items,
  isLoading,
  error,
  onAdd,
}: AddEntitiesModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (opened) {
      setChecked(new Set());
    }
  }, [opened]);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleAdd = () => {
    onAdd([...checked]);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="lg"
      padding="xl"
    >
      <Stack gap="md">
        <TextInput
          value={search}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={searchPlaceholder}
          leftSection={<Icon name="search" />}
        />
        <Box mih="20rem" mah="24rem" style={{ overflowY: "auto" }}>
          <LoadingAndErrorWrapper loading={Boolean(isLoading)} error={error}>
            {items.length === 0 ? (
              <Text
                c="text-secondary"
                ta="center"
                py="lg"
              >{t`No results`}</Text>
            ) : (
              <Stack gap="xs">
                {items.map((item) => (
                  <Checkbox
                    key={item.key}
                    p="sm"
                    label={item.label}
                    description={item.description ?? undefined}
                    checked={item.alreadyAdded || checked.has(item.key)}
                    disabled={item.alreadyAdded}
                    onChange={() => toggle(item.key)}
                  />
                ))}
              </Stack>
            )}
          </LoadingAndErrorWrapper>
        </Box>
        <Group justify="flex-end">
          <Button
            variant="filled"
            onClick={handleAdd}
            disabled={checked.size === 0}
          >{t`Add`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
