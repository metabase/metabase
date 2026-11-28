import { useRef, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import { Box, Button, Group, Icon, Popover, Switch } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { toFilterClause } from "../../harness/clauses";
import type { FilterUiProps } from "../../types";

import { RailroadDiagram } from "./RailroadDiagram";
import {
  type NodePath,
  addAlternative,
  addBranch,
  addRow,
  getNode,
  insertInSeries,
  readRailTree,
  removeAt,
  replaceAt,
  writeRailTree,
} from "./railroad";

type PickerTarget =
  | { kind: "edit"; path: NodePath }
  | { kind: "insert"; andPath: NodePath; index: number }
  | { kind: "alternative"; path: NodePath }
  | { kind: "branch"; orPath: NodePath }
  | { kind: "row" };

type AnchorRect = { left: number; top: number; width: number; height: number };

type OpenPicker = { target: PickerTarget; anchor: AnchorRect };

/**
 * Direction C: the stage's filters drawn as railroad tracks. Series = AND,
 * parallel tracks = OR; any left-to-right path through the diagram matches.
 */
export function RailroadPrototype({
  query,
  stageIndex,
  variant,
  onChange,
}: FilterUiProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<OpenPicker>();
  const [showCounts, setShowCounts] = useState(false);
  const root = readRailTree(query, stageIndex);
  const hasFilters = root.children.length > 0;
  const [onlyChild] = root.children;
  const isSingleFork = root.children.length === 1 && onlyChild?.type === "or";

  const open = (target: PickerTarget, element: Element) => {
    const container = containerRef.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    setPicker({
      target,
      anchor: {
        left: rect.left - (container?.left ?? 0),
        top: rect.top - (container?.top ?? 0),
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const commit = (target: PickerTarget, filterable: Lib.Filterable) => {
    const clause = toFilterClause(query, stageIndex, filterable);
    const next = applyPick(root, target, clause);
    onChange(writeRailTree(query, stageIndex, next));
    setPicker(undefined);
  };

  const editedClause =
    picker?.target.kind === "edit"
      ? getNode(root, picker.target.path)
      : undefined;

  const diagram = (
    <Box ref={containerRef} pos="relative">
      {hasFilters ? (
        <RailroadDiagram
          query={query}
          stageIndex={stageIndex}
          root={root}
          showCounts={showCounts}
          onRemove={(path) =>
            onChange(writeRailTree(query, stageIndex, removeAt(root, path)))
          }
          onEdit={(path, anchor) => open({ kind: "edit", path }, anchor)}
          onInsert={(andPath, index, anchor) =>
            open({ kind: "insert", andPath, index }, anchor)
          }
          onAlternative={(path, anchor) =>
            open({ kind: "alternative", path }, anchor)
          }
          onBranch={(orPath, anchor) =>
            open({ kind: "branch", orPath }, anchor)
          }
        />
      ) : (
        <Group gap="sm">
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={(event) =>
              open(
                { kind: "insert", andPath: [], index: 0 },
                event.currentTarget,
              )
            }
          >
            {t`Add filter`}
          </Button>
        </Group>
      )}
      {hasFilters && (
        <Group mt="xs" justify="space-between">
          {isSingleFork ? (
            <span />
          ) : (
            <Button
              size="compact-sm"
              variant="subtle"
              c="text-secondary"
              leftSection={<Icon name="add" />}
              onClick={(event) => open({ kind: "row" }, event.currentTarget)}
            >
              {t`or`}
            </Button>
          )}
          <Switch
            label={t`Row counts`}
            checked={showCounts}
            onChange={(event) => setShowCounts(event.currentTarget.checked)}
          />
        </Group>
      )}
      <Popover
        opened={picker != null}
        position="bottom-start"
        transitionProps={{ duration: 0 }}
        onChange={(opened) => !opened && setPicker(undefined)}
      >
        <Popover.Target>
          <Box
            pos="absolute"
            style={{ pointerEvents: "none", ...picker?.anchor }}
          />
        </Popover.Target>
        <Popover.Dropdown>
          {picker && (
            <FilterPicker
              query={query}
              stageIndex={stageIndex}
              filter={
                editedClause?.type === "cond" ? editedClause.clause : undefined
              }
              onSelect={(filterable) => commit(picker.target, filterable)}
              onClose={() => setPicker(undefined)}
            />
          )}
        </Popover.Dropdown>
      </Popover>
    </Box>
  );

  return variant === "chill" ? (
    diagram
  ) : (
    <NotebookCell color="core-filter">{diagram}</NotebookCell>
  );
}

function applyPick(
  root: ReturnType<typeof readRailTree>,
  target: PickerTarget,
  clause: Lib.FilterClause,
) {
  switch (target.kind) {
    case "edit":
      return replaceAt(root, target.path, clause);
    case "insert":
      return insertInSeries(root, target.andPath, target.index, clause);
    case "alternative":
      return addAlternative(root, target.path, clause);
    case "branch":
      return addBranch(root, target.orPath, clause);
    case "row":
      return addRow(root, clause);
  }
}
