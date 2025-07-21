import { type MouseEvent, useMemo } from "react";
import { t } from "ttag";

import {
  useDeleteTransformMutation,
  useExecuteTransformMutation,
} from "metabase/api";
import EntityItem from "metabase/common/components/EntityItem";
import { SortableColumnHeader } from "metabase/common/components/ItemsTable/BaseItemsTable";
import {
  ColumnHeader,
  ItemNameCell,
  MaybeItemLink,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import {
  Button,
  Icon,
  type IconName,
  Menu,
  Repeat,
  Skeleton,
} from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { Cell, NameColumn, TableRow } from "../components/BrowseTable.styled";

type TransformsTableProps = {
  transforms?: Transform[];
  skeleton?: boolean;
};

export const itemsTableContainerName = "ItemsTableContainer";

const sharedProps = {
  containerName: itemsTableContainerName,
};

const nameProps = {
  ...sharedProps,
};

const menuProps = {
  ...sharedProps,
};

const DOTMENU_WIDTH = 34;

export function TransformsTable({
  transforms = [],
  skeleton = false,
}: TransformsTableProps) {
  return (
    <Table aria-label={skeleton ? undefined : t`Table of transforms`}>
      <colgroup>
        <NameColumn {...nameProps} />
        <TableColumn {...menuProps} width={DOTMENU_WIDTH} />
        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <SortableColumnHeader
            name="name"
            {...nameProps}
            style={{ paddingInlineStart: ".625rem" }}
            columnHeaderProps={{
              style: { paddingInlineEnd: ".5rem" },
            }}
          >
            {t`Name`}
          </SortableColumnHeader>
          <ColumnHeader
            style={{
              paddingInline: ".5rem",
            }}
          />
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {skeleton ? (
          <Repeat times={7}>
            <TransformRow />
          </Repeat>
        ) : (
          transforms.map((transform: Transform) => (
            <TransformRow transform={transform} key={transform.id} />
          ))
        )}
      </TBody>
    </Table>
  );
}

function TransformRow({ transform }: { transform?: Transform }) {
  return (
    <TableRow>
      <NameCell transform={transform} />
      <MenuCell transform={transform} />
      <Columns.RightEdge.Cell />
    </TableRow>
  );
}

function SkeletonText() {
  return <Skeleton natural h="16.8px" />;
}

function stopPropagation(event: MouseEvent) {
  event.stopPropagation();
}

function preventDefault(event: MouseEvent) {
  event.preventDefault();
}

function NameCell({ transform }: { transform?: Transform }) {
  const headingId = `transform-${transform?.id ?? "dummy"}-heading`;

  return (
    <ItemNameCell
      data-testid="transform-name"
      aria-labelledby={headingId}
      {...nameProps}
    >
      <MaybeItemLink
        to={undefined}
        style={{
          // To align the icons with "Name" in the <th>
          paddingInlineStart: "1.4rem",
          paddingInlineEnd: ".5rem",
        }}
        onClick={preventDefault}
      >
        {transform ? (
          <EntityItem.Name
            name={transform?.name || ""}
            variant="list"
            id={headingId}
          />
        ) : (
          <SkeletonText />
        )}
      </MaybeItemLink>
    </ItemNameCell>
  );
}

type TransformAction = {
  key: string;
  title: string;
  icon: IconName;
  action: () => void;
};

function MenuCell({ transform }: { transform?: Transform }) {
  const [executeTransformMutation] = useExecuteTransformMutation();
  const [deleteTransformMutation] = useDeleteTransformMutation();

  const actions = useMemo(() => {
    if (!transform) {
      return [];
    }

    const actions: TransformAction[] = [];
    actions.push({
      key: "execute",
      title: t`Execute`,
      icon: "play",
      action: () => executeTransformMutation(transform.id),
    });
    actions.push({
      key: "delete",
      title: t`Delete`,
      icon: "trash",
      action: () => deleteTransformMutation(transform.id),
    });

    return actions;
  }, [transform, executeTransformMutation, deleteTransformMutation]);

  return (
    <Cell onClick={stopPropagation} style={{ padding: 0 }}>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            size="xs"
            variant="subtle"
            px="sm"
            aria-label={t`Transform options`}
            c="text-dark"
          >
            <Icon name="ellipsis" />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {actions.map((action) => (
            <Menu.Item
              key={action.key}
              leftSection={<Icon name={action.icon} />}
              onClick={action.action}
            >
              {action.title}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Cell>
  );
}
