import { IconEye, IconPencil, IconTrash } from "@tabler/icons-react";
import { type MouseEvent, useCallback } from "react";
import { Link } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import type { ComponentConfiguration } from "metabase/apps/types";
import EntityItem from "metabase/common/components/EntityItem";
import {
  ColumnHeader,
  ItemNameCell,
  MaybeItemLink,
  TBody,
  Table,
  TableColumn,
} from "metabase/common/components/ItemsTable/BaseItemsTable.styled";
import { Columns } from "metabase/common/components/ItemsTable/Columns";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Group, Skeleton } from "metabase/ui";

import { Cell, NameColumn, TableRow } from "../components/BrowseTable.styled";

// Types for AppsTable

// Table props
export type AppsTableProps = {
  tab: string;
  apps?: ComponentConfiguration[];
};

const itemsTableContainerName = "ItemsTableContainer";
const nameProps = { containerName: itemsTableContainerName };

export function AppsTable({ apps = [], tab }: AppsTableProps) {
  const displayApps = apps.filter((app) =>
    tab === "pages" ? app.type === "page" : app.type === "component",
  );

  return (
    <Table aria-label={t`Table of apps`}>
      <colgroup>
        <NameColumn {...nameProps} />
        <TableColumn />
        {tab === "pages" && <TableColumn width="30%" />}
        <TableColumn width={100} />
        <Columns.RightEdge.Col />
      </colgroup>
      <thead>
        <tr>
          <ColumnHeader
            {...nameProps}
            style={{ paddingInlineStart: ".625rem" }}
          >
            {t`Name`}
          </ColumnHeader>
          <ColumnHeader style={{ paddingInline: ".5rem" }}>
            {t`Type`}
          </ColumnHeader>
          {tab === "pages" && (
            <ColumnHeader style={{ paddingInline: ".5rem" }}>
              {t`URL Slug`}
            </ColumnHeader>
          )}
          <ColumnHeader style={{ paddingInline: ".5rem" }} />
          <Columns.RightEdge.Header />
        </tr>
      </thead>
      <TBody>
        {displayApps.map((app) => (
          <AppRow app={app} key={app.id} tab={tab} />
        ))}
      </TBody>
    </Table>
  );
}

function AppRow({ app, tab }: { app?: ComponentConfiguration; tab: string }) {
  const dispatch = useDispatch();
  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (!app) {
        return;
      }
      const selection = document.getSelection();
      if (selection?.type === "Range") {
        event.stopPropagation();
        return;
      }
      const url = `/apps/edit/${app.id}`;
      if (!url) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && event.button === 0) {
        Urls.openInNewTab(url);
      } else {
        dispatch(push(url));
      }
    },
    [app, dispatch],
  );
  return (
    <TableRow onClick={handleClick}>
      <NameCell app={app} />
      <TypeCell app={app} />
      {tab === "pages" && <UrlSlugCell app={app} />}
      <MenuCell app={app} />
      <Columns.RightEdge.Cell />
    </TableRow>
  );
}

function NameCell({ app }: { app?: ComponentConfiguration }) {
  const headingId = `app-${app?.id ?? "dummy"}-heading`;
  return (
    <ItemNameCell
      data-testid="app-name"
      aria-labelledby={headingId}
      {...nameProps}
    >
      <MaybeItemLink
        to={app ? `/apps/${app.urlSlug}` : undefined}
        style={{ paddingInlineStart: "1.4rem", paddingInlineEnd: ".5rem" }}
        onClick={preventDefault}
      >
        {app ? (
          <EntityItem.Name
            name={app.title || "Untitled App"}
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

function TypeCell({ app }: { app?: ComponentConfiguration }) {
  return <Cell>{app ? app.type : <SkeletonText />}</Cell>;
}

function UrlSlugCell({ app }: { app?: ComponentConfiguration }) {
  return <Cell>{app ? `/${app.urlSlug ?? app.id} ` : <SkeletonText />}</Cell>;
}

function MenuCell({ app }: { app?: ComponentConfiguration }) {
  // Placeholder for future actions
  return (
    <Cell onClick={stopPropagation} style={{ padding: 0 }}>
      <Group>
        <ActionIcon
          component={Link}
          to={`/apps/${app?.id}`}
          variant="subtle"
          size="xs"
        >
          <IconEye />
        </ActionIcon>
        <ActionIcon
          component={Link}
          to={`/apps/edit/${app?.id}`}
          variant="subtle"
          size="xs"
        >
          <IconPencil />
        </ActionIcon>
        <ActionIcon variant="subtle" size="xs" onClick={() => {}}>
          <IconTrash />
        </ActionIcon>
      </Group>
    </Cell>
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
