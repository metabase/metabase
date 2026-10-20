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
  type ClausePath,
  type PillRows,
  addClause,
  getClause,
  removeClause,
  replaceClause,
} from "./orPills";

type GroupEditorProps = {
  query: Lib.Query;
  stageIndex: number;
  rows: PillRows;
  onUpdate: (rows: PillRows) => void;
  /** Ungroups the pill: each row becomes its own top-level filter. */
  onExpand: (rows: PillRows) => void;
};

/**
 * The dropdown for one pill. A pill holding a single standard filter shows the
 * plain filter picker with an "Or…" button (Figma "Filter popover"); anything
 * else shows rows of AND-ed tokens joined by OR (Figma "Group editor"), edited
 * as a draft and written back on "Update filter".
 */
export function GroupEditor({
  query,
  stageIndex,
  rows: initialRows,
  onUpdate,
  onExpand,
}: GroupEditorProps) {
  const [rows, setRows] = useState(initialRows);
  // Only one thing is ever on screen: the single-clause editor, the rows, or
  // the picker that adds/replaces one clause (no picker stacked over the rows).
  const [view, setView] = useState<EditorView>({ type: "auto" });

  const singleClause =
    view.type === "auto"
      ? getSingleStandardClause(query, stageIndex, rows)
      : undefined;
  if (singleClause) {
    return (
      <SingleClauseEditor
        query={query}
        stageIndex={stageIndex}
        clause={singleClause.clause}
        column={singleClause.column}
        onOr={() =>
          setView({
            type: "add",
            target: { kind: "row", rowIndex: rows.length },
          })
        }
        onUpdate={(clause) => onUpdate([[{ type: "clause", clause }]])}
      />
    );
  }

  const handleAdd = (target: AddTarget, filterable: Lib.Filterable) => {
    setRows(
      addClause(rows, target, toFilterClause(query, stageIndex, filterable)),
    );
    setView({ type: "rows" });
  };

  const handleReplace = (path: ClausePath, filterable: Lib.Filterable) => {
    setRows(
      replaceClause(rows, path, toFilterClause(query, stageIndex, filterable)),
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
        filter={getClause(rows, view.path)}
        onSelect={(filterable) => handleReplace(view.path, filterable)}
        onClose={() => setView({ type: "rows" })}
      />
    );
  }

  const renderClause = (path: ClausePath) => {
    const clause = getClause(rows, path);
    return clause ? (
      <Token
        onClick={() => setView({ type: "replace", path })}
        onRemove={() => setRows(removeClause(rows, path))}
      >
        {getFilterLabel(query, stageIndex, clause)}
      </Token>
    ) : null;
  };

  return (
    <Box miw={420} ff="monospace">
      <Stack gap="sm" px="md" pt="sm" pb="md">
        <Stack gap="xs">
          {rows.map((row, rowIndex) => {
            const indexed = row.map((item, itemIndex) => ({ item, itemIndex }));
            const clauses = indexed.filter(
              ({ item }) => item.type === "clause",
            );
            const subgroups = indexed.flatMap(({ item, itemIndex }) =>
              item.type === "subgroup" ? [{ item, itemIndex }] : [],
            );
            return (
              <Fragment key={rowIndex}>
                <Group gap="xs" wrap="wrap" className={S.row}>
                  <Icon name="grabber" c="text-secondary" />
                  <Lead>{rowIndex === 0 ? t`Where` : t`or`}</Lead>
                  {clauses.map(({ itemIndex }, index) => (
                    <Fragment key={itemIndex}>
                      {index > 0 && <Connector label={t`and`} />}
                      {renderClause({ rowIndex, itemIndex })}
                    </Fragment>
                  ))}
                  <RowAddMenu
                    className={S.rowAdd}
                    onAddFilter={() =>
                      setView({
                        type: "add",
                        target: { kind: "row", rowIndex },
                      })
                    }
                    onAddSubgroup={() =>
                      setView({
                        type: "add",
                        target: { kind: "new-subgroup", rowIndex },
                      })
                    }
                  />
                </Group>
                {/* Figma: a subgroup is its own line, indented past the row's lead. */}
                {subgroups.map(({ item, itemIndex }) => (
                  <Group key={itemIndex} gap="xs" wrap="wrap" className={S.row}>
                    <Icon name="grabber" c="text-secondary" />
                    <Lead />
                    <Lead>{t`and`}</Lead>
                    {item.clauses.map((_clause, clauseIndex) => (
                      <Fragment key={clauseIndex}>
                        {clauseIndex > 0 && <Connector label={t`or`} />}
                        {renderClause({ rowIndex, itemIndex, clauseIndex })}
                      </Fragment>
                    ))}
                    <AddButton
                      label={t`or`}
                      className={S.rowAdd}
                      onClick={() =>
                        setView({
                          type: "add",
                          target: { kind: "subgroup", rowIndex, itemIndex },
                        })
                      }
                    />
                  </Group>
                ))}
              </Fragment>
            );
          })}
        </Stack>
        <Box>
          <AddButton
            label={t`or`}
            fw="bold"
            onClick={() =>
              setView({
                type: "add",
                target: { kind: "row", rowIndex: rows.length },
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
          // Changes the logic: OR rows become AND-ed top-level pills.
          onClick={() => onExpand(rows)}
        >
          {t`Expand`}
        </Button>
        <Button variant="filled" onClick={() => onUpdate(rows)}>
          {t`Update filter`}
        </Button>
      </Group>
    </Box>
  );
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
};

function getSingleStandardClause(
  query: Lib.Query,
  stageIndex: number,
  rows: PillRows,
): SingleStandardClause | undefined {
  const [firstRow = [], ...otherRows] = rows;
  const [item, ...otherItems] = firstRow;
  if (
    item?.type !== "clause" ||
    otherRows.length > 0 ||
    otherItems.length > 0
  ) {
    return undefined;
  }
  const { clause } = item;
  const column = Lib.filterParts(query, stageIndex, clause)?.column;
  return column ? { clause, column } : undefined;
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
  | { type: "replace"; path: ClausePath };

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
  onAddFilter: () => void;
  onAddSubgroup: () => void;
};

/** Figma "Alt · + offers Filter or Subgroup": the row's "+" picks what to add. */
function RowAddMenu({
  className,
  onAddFilter,
  onAddSubgroup,
}: RowAddMenuProps) {
  const [isOpened, setIsOpened] = useState(false);

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
          aria-label={t`Add to this row`}
          className={className}
          data-opened={isOpened}
          onClick={() => setIsOpened((opened) => !opened)}
        />
      </Menu.Target>
      <Menu.Dropdown w={380} p={0} ff="monospace">
        <Menu.Item className={S.menuItem} onClick={onAddFilter}>
          <MenuItemLabel
            title={t`Filter`}
            description={t`One more filter connected by and`}
          />
        </Menu.Item>
        <Menu.Item className={S.menuItem} onClick={onAddSubgroup}>
          <MenuItemLabel
            title={t`Subgroup`}
            description={t`Several filters where at least one must match: and ( … or … )`}
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
