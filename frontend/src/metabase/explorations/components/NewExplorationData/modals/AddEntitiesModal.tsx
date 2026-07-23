import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  selectedKeys?: Set<string>;
  emptyState?: ReactNode;
}

type Row =
  | { type: "header"; key: string; label: string }
  | { type: "item"; key: string; item: AddEntitiesModalItem };

const ROW_GAP = 8;
const ESTIMATED_ROW_HEIGHT = 64;

function toRows(items: AddEntitiesModalItem[]): Row[] {
  const rows: Row[] = [];
  let prevGroup: string | undefined;
  for (const item of items) {
    if (item.groupLabel != null && item.groupLabel !== prevGroup) {
      rows.push({
        type: "header",
        key: `header:${item.groupLabel}`,
        label: item.groupLabel,
      });
    }
    prevGroup = item.groupLabel;
    rows.push({ type: "item", key: item.key, item });
  }
  return rows;
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
  selectedKeys,
  emptyState,
}: AddEntitiesModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const wasOpen = useRef(false);
  useEffect(() => {
    if (opened && !wasOpen.current) {
      setChecked(new Set(selectedKeys));
    }
    wasOpen.current = opened;
  }, [opened, selectedKeys]);

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

  const rows = useMemo(() => toRows(items), [items]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: useCallback(() => scrollRef.current, []),
    estimateSize: useCallback(() => ESTIMATED_ROW_HEIGHT, []),
    measureElement: useCallback(
      (el: Element | null) =>
        (el?.getBoundingClientRect().height ?? ESTIMATED_ROW_HEIGHT) + ROW_GAP,
      [],
    ),
    overscan: 8,
  });

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
        <Box
          ref={scrollRef}
          mih="20rem"
          mah="24rem"
          style={{ overflowY: "auto" }}
        >
          <LoadingAndErrorWrapper loading={Boolean(isLoading)} error={error}>
            {items.length === 0 ? (
              (emptyState ?? (
                <Text
                  c="text-secondary"
                  ta="center"
                  py="lg"
                >{t`No results`}</Text>
              ))
            ) : (
              <Box
                style={{
                  position: "relative",
                  width: "100%",
                  height: virtualizer.getTotalSize(),
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const positioning = {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  } as const;

                  if (row.type === "header") {
                    return (
                      <Text
                        key={virtualRow.key}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        size="sm"
                        fw="bold"
                        c="text-secondary"
                        pt="xs"
                        style={positioning}
                      >
                        {row.label}
                      </Text>
                    );
                  }

                  const { item } = row;
                  return (
                    <Box
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      component="label"
                      className={cx(S.card, {
                        [S.cardSelected]: checked.has(item.key),
                      })}
                      data-interestingness={item.interestingness ?? "null"}
                      style={positioning}
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
                  );
                })}
              </Box>
            )}
          </LoadingAndErrorWrapper>
        </Box>
        <Group justify="flex-end">
          {!emptyState && (
            <Button
              variant="filled"
              onClick={handleAdd}
              disabled={checked.size === 0}
            >{t`Add`}</Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
