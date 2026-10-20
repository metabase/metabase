import { Fragment, forwardRef, useRef, useState } from "react";
import { t } from "ttag";

import { FilterPicker } from "metabase/querying/filters/components/FilterPicker";
import { FilterPickerBody } from "metabase/querying/filters/components/FilterPicker/FilterPickerBody";
import {
  Box,
  Button,
  Divider,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, toFilterClause } from "../../harness/clauses";

import S from "./GroupEditor.module.css";
import { Token } from "./Token";
import {
  type AddTarget,
  type GroupNode,
  type Operator,
  type PillPath,
  type PillTree,
  addClause,
  getClause,
  getOperator,
  removeClause,
  replaceClause,
} from "./orPills";

type GroupEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  tree: PillTree;
  onUpdate: (tree: PillTree) => void;
  /** Ungroups the pill: every clause, at any depth, becomes a top-level filter. */
  onExpand: (tree: PillTree) => void;
};

/**
 * The dropdown for one pill. A pill holding a single standard filter shows the
 * plain filter picker with an "Or…" button (Figma "Filter popover"); anything
 * else shows rows of AND-ed tokens joined by OR, nesting as deep as needed
 * (Figma "Group editor"), edited as a draft and written back on "Update filter".
 */
export function GroupEditor({
  query,
  stageIndex,
  tree: initialTree,
  onUpdate,
  onExpand,
}: GroupEditorProps) {
  const [tree, setTree] = useState(initialTree);
  // Only one thing is ever on screen: the single-clause editor, the rows, or
  // the picker that adds/replaces one clause (no picker stacked over the rows).
  const [view, setView] = useState<EditorView>({ type: "auto" });

  const singleClause =
    view.type === "auto"
      ? getSingleStandardClause(query, stageIndex, tree)
      : undefined;
  if (singleClause) {
    return (
      <SingleClauseEditor
        query={query}
        stageIndex={stageIndex}
        clause={singleClause.clause}
        column={singleClause.column}
        onOr={() =>
          setView({ type: "add", target: { kind: "subgroup", groupPath: [] } })
        }
        onUpdate={(clause) =>
          onUpdate(replaceClause(tree, singleClause.path, clause))
        }
      />
    );
  }

  const handleAdd = (target: AddTarget, filterable: Lib.Filterable) => {
    setTree(
      addClause(tree, target, toFilterClause(query, stageIndex, filterable)),
    );
    setView({ type: "rows" });
  };

  const handleReplace = (path: PillPath, filterable: Lib.Filterable) => {
    setTree(
      replaceClause(tree, path, toFilterClause(query, stageIndex, filterable)),
    );
    setView({ type: "rows" });
  };

  if (view.type === "add") {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={(filterable) => handleAdd(view.target, filterable)}
        onClose={() => setView({ type: "rows" })}
      />
    );
  }

  if (view.type === "replace") {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        filter={getClause(tree, view.path)}
        onSelect={(filterable) => handleReplace(view.path, filterable)}
        onClose={() => setView({ type: "rows" })}
      />
    );
  }

  return (
    <Box miw={420} ff="monospace">
      <Stack gap="sm" px="md" pt="sm" pb="md">
        <Stack gap="xs">
          {tree.children.map((row, rowIndex) =>
            row.type === "group" ? (
              <GroupLines
                key={rowIndex}
                query={query}
                stageIndex={stageIndex}
                group={row}
                depth={1}
                path={[rowIndex]}
                lead={rowIndex === 0 ? t`Where` : getOperatorLabel("or")}
                onAdd={(target) => setView({ type: "add", target })}
                onReplace={(path) => setView({ type: "replace", path })}
                onRemove={(path) => setTree(removeClause(tree, path))}
              />
            ) : null,
          )}
        </Stack>
        <Box>
          <AddButton
            label={getOperatorLabel("or")}
            fw="bold"
            onClick={() =>
              setView({
                type: "add",
                target: { kind: "subgroup", groupPath: [] },
              })
            }
          />
        </Box>
      </Stack>
      <Divider />
      <Group justify="space-between" p="md">
        <Button
          variant="subtle"
          size="compact-md"
          px={0}
          // Changes the logic: every clause becomes an AND-ed top-level pill.
          onClick={() => onExpand(tree)}
        >
          {t`Expand`}
        </Button>
        <Button variant="filled" onClick={() => onUpdate(tree)}>
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}

type GroupLinesProps = {
  query: Lib.Query;
  stageIndex: number;
  group: GroupNode;
  depth: number;
  path: PillPath;
  lead: string;
  onAdd: (target: AddTarget) => void;
  onReplace: (path: PillPath) => void;
  onRemove: (path: PillPath) => void;
};

/**
 * One group as a line of its clauses joined by the group's connector, followed
 * by one indented line per subgroup (Figma: a subgroup is its own line,
 * indented past its parent's lead), recursively.
 */
function GroupLines({
  query,
  stageIndex,
  group,
  depth,
  path,
  lead,
  onAdd,
  onReplace,
  onRemove,
}: GroupLinesProps) {
  const operator = getOperator(depth);
  const childOperator = getOperator(depth + 1);
  const indexed = group.children.map((node, index) => ({ node, index }));
  const clauses = indexed.flatMap(({ node, index }) =>
    node.type === "clause" ? [{ clause: node.clause, index }] : [],
  );
  const subgroups = indexed.flatMap(({ node, index }) =>
    node.type === "group" ? [{ group: node, index }] : [],
  );

  return (
    <>
      <Group gap="xs" wrap="wrap" className={S.row}>
        <Icon name="grabber" c="text-secondary" />
        {Array.from({ length: depth - 1 }, (_, index) => (
          <Lead key={index} />
        ))}
        <Lead>{lead}</Lead>
        {clauses.map(({ clause, index }, position) => (
          <Fragment key={index}>
            {position > 0 && <Connector label={getOperatorLabel(operator)} />}
            <Token
              onClick={() => onReplace([...path, index])}
              onRemove={() => onRemove([...path, index])}
            >
              {getFilterLabel(query, stageIndex, clause)}
            </Token>
          </Fragment>
        ))}
        <RowAddMenu
          className={S.rowAdd}
          operator={operator}
          childOperator={childOperator}
          onAddFilter={() => onAdd({ kind: "clause", groupPath: path })}
          onAddSubgroup={() => onAdd({ kind: "subgroup", groupPath: path })}
        />
      </Group>
      {subgroups.map(({ group: subgroup, index }) => (
        <GroupLines
          key={index}
          query={query}
          stageIndex={stageIndex}
          group={subgroup}
          depth={depth + 1}
          path={[...path, index]}
          lead={getOperatorLabel(operator)}
          onAdd={onAdd}
          onReplace={onReplace}
          onRemove={onRemove}
        />
      ))}
    </>
  );
}

export function getOperatorLabel(operator: Operator) {
  return operator === "and" ? t`and` : t`or`;
}

function Connector({ label }: { label: string }) {
  return <Text c="text-secondary">{label}</Text>;
}

const LEAD_WIDTH = 52;

function Lead({ children }: { children?: string }) {
  return (
    <Text w={LEAD_WIDTH} c="text-secondary">
      {children}
    </Text>
  );
}

type SingleStandardClause = {
  clause: Lib.FilterClause;
  column: Lib.ColumnMetadata;
  path: PillPath;
};

function getSingleStandardClause(
  query: Lib.Query,
  stageIndex: number,
  tree: PillTree,
): SingleStandardClause | undefined {
  const [row, ...otherRows] = tree.children;
  if (row?.type !== "group" || otherRows.length > 0) {
    return undefined;
  }
  const [node, ...otherNodes] = row.children;
  if (node?.type !== "clause" || otherNodes.length > 0) {
    return undefined;
  }
  const { clause } = node;
  const column = Lib.filterParts(query, stageIndex, clause)?.column;
  return column ? { clause, column, path: [0, 0] } : undefined;
}

type SingleClauseEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  clause: Lib.FilterClause;
  column: Lib.ColumnMetadata;
  onOr: () => void;
  onUpdate: (clause: Lib.FilterClause) => void;
};

/** Figma "Filter popover": the real picker body with "Or…" next to "Update filter". */
function SingleClauseEditor({
  query,
  stageIndex,
  clause,
  column,
  onOr,
  onUpdate,
}: SingleClauseEditorProps) {
  const [isPickingColumn, setIsPickingColumn] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleChange = (filterable: Lib.Filterable) => {
    onUpdate(toFilterClause(query, stageIndex, filterable));
  };

  if (isPickingColumn) {
    return (
      <FilterPicker
        query={query}
        stageIndex={stageIndex}
        onSelect={handleChange}
        onClose={() => setIsPickingColumn(false)}
      />
    );
  }

  return (
    <Box ref={bodyRef}>
      <FilterPickerBody
        query={query}
        stageIndex={stageIndex}
        column={column}
        filter={clause}
        isNew={false}
        withSubmitButton={false}
        onChange={handleChange}
        onBack={() => setIsPickingColumn(true)}
      />
      <Divider />
      <Group justify="space-between" p="md" ff="monospace">
        <Button variant="default" onClick={onOr}>
          {t`Or…`}
        </Button>
        <Button
          variant="filled"
          // The picker body commits on form submit; its own submit button is hidden.
          onClick={() =>
            bodyRef.current?.querySelector("form")?.requestSubmit()
          }
        >
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
}

type EditorView =
  | { type: "auto" }
  | { type: "rows" }
  | { type: "add"; target: AddTarget }
  | { type: "replace"; path: PillPath };

type AddButtonProps = {
  label?: string;
  className?: string;
  fw?: "bold";
  "aria-label"?: string;
  onClick: () => void;
};

const AddButton = forwardRef<HTMLButtonElement, AddButtonProps>(
  function AddButton({ label, className, fw, onClick, ...props }, ref) {
    return (
      <Button
        ref={ref}
        size="compact-md"
        variant="subtle"
        c="text-secondary"
        fw={fw ?? "normal"}
        className={className}
        leftSection={<Icon name="add" />}
        onClick={onClick}
        {...props}
      >
        {label}
      </Button>
    );
  },
);

type RowAddMenuProps = {
  className?: string;
  operator: Operator;
  childOperator: Operator;
  onAddFilter: () => void;
  onAddSubgroup: () => void;
};

/** Figma "Alt · + offers Filter or Subgroup": the line's "+" picks what to add. */
function RowAddMenu({
  className,
  operator,
  childOperator,
  onAddFilter,
  onAddSubgroup,
}: RowAddMenuProps) {
  const [isOpened, setIsOpened] = useState(false);
  const operatorLabel = getOperatorLabel(operator);
  const childOperatorLabel = getOperatorLabel(childOperator);

  return (
    <Menu
      opened={isOpened}
      position="bottom-start"
      // Rendered inside the editor's dropdown, so picking an item is not an
      // outside click for the pill's own popover.
      withinPortal={false}
      onChange={setIsOpened}
    >
      <Menu.Target>
        <AddButton
          aria-label={t`Add to this line`}
          className={className}
          data-opened={isOpened}
          onClick={() => setIsOpened((opened) => !opened)}
        />
      </Menu.Target>
      <Menu.Dropdown w={380} p={0} ff="monospace">
        <Menu.Item className={S.menuItem} onClick={onAddFilter}>
          <MenuItemLabel
            title={t`Filter`}
            description={t`One more filter connected by ${operatorLabel}`}
          />
        </Menu.Item>
        <Menu.Item className={S.menuItem} onClick={onAddSubgroup}>
          <MenuItemLabel
            title={t`Subgroup`}
            description={t`Several filters joined by ${childOperatorLabel}: ${operatorLabel} ( … ${childOperatorLabel} … )`}
          />
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function MenuItemLabel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Stack gap={4}>
      <Text fw="bold" c="text-primary">
        {title}
      </Text>
      <Text size="sm" c="text-secondary">
        {description}
      </Text>
    </Stack>
  );
}
