import { type ReactElement, isValidElement } from "react";

import { TableInfoIcon } from "metabase/common/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { getPrimarySourceMetadata } from "metabase/querying/common/utils";
import * as Urls from "metabase/urls";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type Table from "metabase-lib/v1/metadata/Table";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { IconName } from "metabase-types/api";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";
import HeaderS from "../HeaderBreadcrumbs/HeaderBreadcrumbs.module.css";

import S from "./QuestionDataSource.module.css";

export type DataSourcePart = ReactElement | DataSourceBadgePart;

type DataSourceBadgePart = {
  name?: string;
  href?: string;
  icon?: IconName;
  model?: DataSourceModel;
};

type DataSourceModel =
  | "database"
  | "schema"
  | "table"
  | "question"
  | "model"
  | "metric";

type TableDataSourceItem = {
  type: "table";
  key: string;
  name: string;
  href: string;
  table: Table;
};

type CardDataSourceItem = {
  type: "card";
  key: string;
  name: string;
  href: string;
  model: CardDataSourceModel;
};

type CardDataSourceModel = Extract<
  DataSourceModel,
  "question" | "model" | "metric"
>;

type DataSourceItem = TableDataSourceItem | CardDataSourceItem;

export function getDataSourceParts({
  question,
  subHead,
  isObjectDetail,
  formatTableAsComponent = true,
  hasMultipleSchemas = false,
}: {
  question: Question;
  subHead?: boolean;
  isObjectDetail?: boolean;
  formatTableAsComponent?: boolean;
  hasMultipleSchemas?: boolean;
}): DataSourcePart[] {
  if (!question) {
    return [];
  }

  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);

  const hasDataPermission = isEditable;
  if (!hasDataPermission) {
    return [];
  }

  const parts: DataSourcePart[] = [];

  const metadata = question.metadata();
  const database = metadata.database(Lib.databaseID(query));

  if (database) {
    parts.push({
      icon: !subHead ? "database" : undefined,
      name: database.displayName(),
      href: database.id >= 0 ? Urls.browseDatabase(database) : undefined,
      model: "database",
    });
  }

  const hasTableLink = subHead || isObjectDetail;

  if (isNative) {
    // Unjustified type cast. FIXME
    const table = (question.legacyNativeQuery() as NativeQuery).table();
    if (table == null) {
      return filterParts(parts);
    }
    return [
      {
        name: table.displayName(),
        href: hasTableLink ? getTableURL(table) : "",
      },
    ];
  }

  const items = [
    getPrimarySourceMetadata(query),
    ...Lib.joins(query, -1).map((join) => Lib.joinedThing(query, join)),
  ]
    .filter(isNotNull)
    .map((source) => getDataSourceItem(query, metadata, source))
    .filter(isNotNull);

  const [sourceItem] = items;
  if (sourceItem != null) {
    if (sourceItem.type === "table") {
      pushSchemaPart(parts, database, sourceItem.table, hasMultipleSchemas);
    }

    const part: DataSourcePart = formatTableAsComponent ? (
      <QuestionTableBadges
        items={items}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />
    ) : (
      {
        name: sourceItem.name,
        href: hasTableLink ? sourceItem.href : "",
        model: sourceItem.type === "table" ? "table" : sourceItem.model,
      }
    );

    parts.push(part);
  }

  return filterParts(parts);
}

function pushSchemaPart(
  parts: DataSourcePart[],
  database: Database | null | undefined,
  table: Table,
  hasMultipleSchemas: boolean,
) {
  if (table.schema_name && hasMultipleSchemas && database != null) {
    parts.push({
      model: "schema",
      name: table.schema_name,
      href: database.id >= 0 ? Urls.browseSchema(table) : undefined,
    });
  }
}

function filterParts(parts: DataSourcePart[]): DataSourcePart[] {
  return parts.filter(
    (part) =>
      isValidElement(part) ||
      ("name" in part && part.name) ||
      ("icon" in part && part.icon),
  );
}

function getDataSourceItem(
  query: Lib.Query,
  metadata: Metadata,
  source: Lib.TableMetadata | Lib.CardMetadata,
): DataSourceItem | undefined {
  const pickerInfo = Lib.pickerInfo(query, source);

  if (pickerInfo?.cardId != null) {
    const sourceInfo = Lib.displayInfo(query, -1, source);
    return {
      type: "card",
      key: `card:${pickerInfo.cardId}`,
      name: sourceInfo.displayName,
      href: Urls.card({ id: pickerInfo.cardId, name: sourceInfo.displayName }),
      model: getCardModel(sourceInfo),
    };
  }

  const table =
    pickerInfo?.tableId != null ? metadata.table(pickerInfo.tableId) : null;
  if (table == null) {
    return undefined;
  }

  return {
    type: "table",
    key: `table:${table.id}`,
    name: table.displayName(),
    href: getTableURL(table),
    table,
  };
}

function getCardModel(cardInfo: Lib.CardDisplayInfo): CardDataSourceModel {
  if (cardInfo.isModel) {
    return "model";
  }
  if (cardInfo.isMetric) {
    return "metric";
  }
  return "question";
}

type QuestionTableBadgesProps = {
  items: DataSourceItem[];
  subHead?: boolean;
  hasLink?: boolean;
  isLast?: boolean;
};

function QuestionTableBadges({
  items,
  subHead,
  hasLink,
  isLast,
}: QuestionTableBadgesProps) {
  const badgeInactiveColor =
    isLast && !subHead ? "text-primary" : "text-secondary";

  const parts = items.map((item) => (
    <HeadBreadcrumbs.Breadcrumb
      key={item.key}
      to={hasLink ? item.href : ""}
      color={badgeInactiveColor}
    >
      <span>
        {item.name}
        {!subHead && item.type === "table" && (
          <span className={S.IconWrapper}>
            <TableInfoIcon
              table={item.table}
              icon="info"
              size={16}
              position="bottom"
              className={HeaderS.HeaderBadgeIcon}
            />
          </span>
        )}
      </span>
    </HeadBreadcrumbs.Breadcrumb>
  ));

  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
      divider={<span className={S.TablesDivider}>+</span>}
      data-testid="question-table-badges"
    />
  );
}

function getTableURL(table: Table) {
  return Urls.question(table.newQuestion());
}
