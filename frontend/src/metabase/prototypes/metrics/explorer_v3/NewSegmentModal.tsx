import cx from "classnames";
import { useRef, useState } from "react";

import {
  Button,
  Group,
  Icon,
  Modal,
  PillsInput,
  Stack,
  TextInput,
} from "metabase/ui";

import S from "./Explorer.module.css";
import { type BarItem, TokenBar, matchesItem } from "./TokenBar";
import { type WhereToken, newKey } from "./formula";
import type { Segment } from "./segments";

const LOGIC = ["and", "or", "(", ")"];
const LOGIC_PREFIX = "logic:";
const LOGIC_ITEMS: BarItem[] = LOGIC.map((key) => ({
  id: `${LOGIC_PREFIX}${key}`,
  label: key.toUpperCase(),
  aliases: [key],
  section: "Logic",
  sectionIcon: "calculator",
}));

const isLogic = (token: WhereToken) => LOGIC.includes(token.filter);
const endsCondition = (token: WhereToken | undefined) =>
  token != null && (!isLogic(token) || token.filter === ")");

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
  const filters = conditions.filter((token) => !isLogic(token));
  const canSave = name.trim() !== "" && filters.length > 0;

  /** Inserts at the caret; a condition right after another gets an And between. */
  const insert = (filter: string, caret: number) => {
    const needsAnd =
      (!LOGIC.includes(filter) || filter === "(") &&
      endsCondition(conditions[caret - 1]);
    const added = [
      ...(needsAnd ? [{ key: newKey(), filter: "and" }] : []),
      { key: newKey(), filter },
    ];
    setConditions(conditions.toSpliced(caret, 0, ...added));
    return caret + added.length;
  };
  const toggleLogic = (key: string) =>
    setConditions(
      conditions.map((token) =>
        token.key === key
          ? { ...token, filter: token.filter === "and" ? "or" : "and" }
          : token,
      ),
    );

  const handleSave = () =>
    onSave({
      id: `segment:new-${newKey()}`,
      name: name.trim(),
      table,
      conditions: filters.map(({ filter }) => filter),
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
        <PillsInput label="Filter conditions" className={S.inputBar}>
          <TokenBar
            tokens={conditions}
            inputRef={inputRef}
            placeholder="Type a condition, like Quantity ≥ 5"
            title="Filter by"
            isConnector={isLogic}
            onKeyChar={(char, caret) =>
              char === "(" || char === ")" ? insert(char, caret) : null
            }
            renderToken={(token, { isSelected }) =>
              isLogic(token) ? (
                <button
                  className={cx(S.connector, { [S.selected]: isSelected })}
                  onClick={() =>
                    token.filter === "and" || token.filter === "or"
                      ? toggleLogic(token.key)
                      : setConditions(
                          conditions.filter(({ key }) => key !== token.key),
                        )
                  }
                >
                  {token.filter.toUpperCase()}
                </button>
              ) : (
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
              )
            }
            getItems={(query) => [
              ...getItems(
                query,
                filters.map(({ filter }) => filter),
              ),
              ...LOGIC_ITEMS.filter((item) => matchesItem(item, query)),
            ]}
            onPick={(item, caret) =>
              insert(
                item.id.startsWith(LOGIC_PREFIX)
                  ? item.id.slice(LOGIC_PREFIX.length)
                  : item.id,
                caret,
              )
            }
            onOpenToken={(index) => toggleLogic(conditions[index].key)}
            onDelete={(index) => {
              setConditions(conditions.toSpliced(index, 1));
              return index;
            }}
          />
        </PillsInput>
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
