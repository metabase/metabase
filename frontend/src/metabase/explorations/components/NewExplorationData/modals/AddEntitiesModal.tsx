import cx from "classnames";
import { Fragment, type ReactNode, useEffect, useState } from "react";
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

import S from "./AddEntitiesModal.module.css";

export interface AddEntitiesModalItem {
  key: string;
  label: string;
  description?: string | null;
  /** Section heading; a new header renders whenever this changes. */
  groupLabel?: string;
  interestingness?: number | null;
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
  onAdd: (keys: string[]) => void;
  tabs?: ReactNode;
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
  tabs,
}: AddEntitiesModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Every open starts with a clean slate.
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
        {tabs}
        <Box mih="20rem" mah="24rem" style={{ overflowY: "auto" }}>
          <LoadingAndErrorWrapper loading={Boolean(isLoading)} error={error}>
            {items.length === 0 ? (
              <Text
                c="text-secondary"
                ta="center"
                py="lg"
              >{t`No results`}</Text>
            ) : (
              <Stack gap="sm">
                {items.map((item, index) => {
                  const showHeader =
                    item.groupLabel != null &&
                    item.groupLabel !== items[index - 1]?.groupLabel;
                  return (
                    <Fragment key={item.key}>
                      {showHeader && (
                        <Text
                          size="sm"
                          fw="bold"
                          c="text-secondary"
                          mt={index === 0 ? 0 : "xs"}
                        >
                          {item.groupLabel}
                        </Text>
                      )}
                      {/* The whole card is the checkbox's <label>, so a click
                          anywhere inside it toggles the contained input once. */}
                      <Box
                        component="label"
                        className={cx(S.card, {
                          [S.cardSelected]: checked.has(item.key),
                        })}
                        data-interestingness={item.interestingness || "null"}
                      >
                        <Checkbox
                          checked={checked.has(item.key)}
                          onChange={() => toggle(item.key)}
                          aria-label={item.label}
                        />
                        <Stack gap={2} flex={1} miw={0}>
                          <Text fw="bold" lh="1.25rem">
                            {item.label}
                          </Text>
                          {item.description && (
                            <Text size="sm" c="text-secondary">
                              {item.description}
                            </Text>
                          )}
                        </Stack>
                      </Box>
                    </Fragment>
                  );
                })}
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
