import cx from "classnames";
import { useRef, useState } from "react";

import {
  Box,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import S from "./Explorer.module.css";
import { type BarItem, TokenBar } from "./TokenBar";
import { type WhereToken, newKey } from "./formula";
import type { Segment } from "./segments";

/**
 * The quick New segment flow from a pill: a name and its filter conditions.
 * Saving adds it to the table's segments and applies it to the pill.
 */
export function NewSegmentModal({
  initialName,
  table,
  getItems,
  onClose,
  onSave,
}: {
  initialName: string;
  table: string;
  getItems: (query: string, exclude: string[]) => BarItem[];
  onClose: () => void;
  onSave: (segment: Segment) => void;
}) {
  const [name, setName] = useState(initialName);
  const [conditions, setConditions] = useState<WhereToken[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSave = name.trim() !== "" && conditions.length > 0;

  const handleSave = () =>
    onSave({
      id: `segment:new-${newKey()}`,
      name: name.trim(),
      table,
      conditions: conditions.map(({ filter }) => filter),
    });

  return (
    <Modal opened title={`New segment of ${table}`} onClose={onClose} size="lg">
      <Stack gap="lg">
        <TextInput
          label="Name"
          placeholder="Like Weekdays or Lunch hours"
          value={name}
          data-autofocus={initialName === ""}
          onChange={(event) => setName(event.target.value)}
        />
        <Stack gap="xs">
          <Text fw="bold">Filter conditions</Text>
          <Box className={S.explorerBox}>
            <TokenBar
              tokens={conditions}
              inputRef={inputRef}
              placeholder="Type a condition, like Quantity ≥ 5"
              title="Filter by"
              renderToken={(token, { isSelected }) => (
                <span className={cx(S.pill, { [S.selected]: isSelected })}>
                  <span className={cx(S.seg, S.segFilter)}>{token.filter}</span>
                  <Icon
                    name="close"
                    size={12}
                    className={S.removeIcon}
                    aria-label="Remove"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setConditions(
                        conditions.filter(({ key }) => key !== token.key),
                      )
                    }
                  />
                </span>
              )}
              getItems={(query) =>
                getItems(
                  query,
                  conditions.map(({ filter }) => filter),
                )
              }
              onPick={(item, caret) => {
                setConditions(
                  conditions.toSpliced(caret, 0, {
                    key: newKey(),
                    filter: item.id,
                  }),
                );
                return caret + 1;
              }}
              onDelete={(index) => {
                setConditions(conditions.toSpliced(index, 1));
                return index;
              }}
              onOpenToken={() => undefined}
            />
          </Box>
          <Text size="sm" c="text-secondary">
            {`Rows of ${table} that match all of them.`}
          </Text>
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="filled" disabled={!canSave} onClick={handleSave}>
            Save and apply
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
