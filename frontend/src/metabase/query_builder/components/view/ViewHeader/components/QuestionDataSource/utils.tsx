import { type ReactElement, isValidElement } from "react";

import { TableInfoIcon } from "metabase/common/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { getPrimarySourceMetadata } from "metabase/querying/common/utils";
import * as Urls from "metabase/urls";
import { isNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatabaseId, IconName, TableId } from "metabase-types/api";

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
  tableId: TableId;
  schemaName: string | null;
  description: string | null;
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

type DataSourcePartsOpts = {
  subHead?: boolean;
  isObjectDetail?: boolean;
  formatTableAsComponent?: boolean;
  hasMultipleSchemas?: boolean;
};

export function getDataSourceParts({
  question,
  ...opts
}: DataSourcePartsOpts & { question: Question }): DataSourcePart[] {
  if (!question) {
    return [];
  }

  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);

  const hasDataPermission = isEditable;
  if (!hasDataPermission) {
    return [];
  }

  return isNative
    ? getNativeDataSourceParts(query, opts)
    : getQueryDataSourceParts(query, opts);
}

function getNativeDataSourceParts(
  query: Lib.Query,
  { subHead }: DataSourcePartsOpts,
): DataSourcePart[] {
  const parts: DataSourcePart[] = [];
  const databaseId = Lib.databaseID(query);
  const databaseInfo = Lib.databaseDisplayInfo(query);

  if (databaseId != null && databaseInfo != null) {
    parts.push({
      icon: !subHead ? "database" : undefined,
      name: databaseInfo.displayName,
      href:
        databaseId >= 0
          ? Urls.browseDatabase({ id: databaseId, name: databaseInfo.name })
          : undefined,
      model: "database",
    });
  }

  const collection = Lib.nativeExtras(query)?.collection;
  if (collection == null) {
    return filterParts(parts);
  }

  return [{ name: collection }];
}

function getQueryDataSourceParts(
  query: Lib.Query,
  {
    subHead,
    isObjectDetail,
    formatTableAsComponent = true,
    hasMultipleSchemas = false,
  }: DataSourcePartsOpts,
): DataSourcePart[] {
  const parts: DataSourcePart[] = [];
  const databaseId = Lib.databaseID(query);
  const database = Lib.databaseMetadata(query);

  if (databaseId != null && database != null) {
    const databaseInfo = Lib.displayInfo(query, -1, database);
    parts.push({
      icon: !subHead ? "database" : undefined,
      name: databaseInfo.displayName,
      href:
        databaseId >= 0
          ? Urls.browseDatabase({ id: databaseId, name: databaseInfo.name })
          : undefined,
      model: "database",
    });
  }

  const items = [
    getPrimarySourceMetadata(query),
    ...Lib.joins(query, -1).map((join) => Lib.joinedThing(query, join)),
  ]
    .filter(isNotNull)
    .map((source) => getDataSourceItem(query, source))
    .filter(isNotNull);

  const [sourceItem] = items;
  if (sourceItem == null) {
    return filterParts(parts);
  }

  const schemaPart = getSchemaPart(sourceItem, databaseId, hasMultipleSchemas);
  if (schemaPart != null) {
    parts.push(schemaPart);
  }

  const hasTableLink = subHead || isObjectDetail;
  parts.push(
    formatTableAsComponent ? (
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
    ),
  );

  return filterParts(parts);
}

function getSchemaPart(
  sourceItem: DataSourceItem,
  databaseId: DatabaseId | null,
  hasMultipleSchemas: boolean,
): DataSourceBadgePart | undefined {
  if (
    sourceItem.type !== "table" ||
    sourceItem.schemaName == null ||
    databaseId == null ||
    !hasMultipleSchemas
  ) {
    return undefined;
  }

  return {
    model: "schema",
    name: sourceItem.schemaName,
    href:
      databaseId >= 0
        ? Urls.browseSchema({
            db_id: databaseId,
            schema_name: sourceItem.schemaName,
          })
        : undefined,
  };
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
  source: Lib.TableMetadata | Lib.CardMetadata,
): DataSourceItem | undefined {
  const pickerInfo = Lib.pickerInfo(query, source);
  if (pickerInfo == null) {
    return undefined;
  }

  const sourceInfo = Lib.displayInfo(query, -1, source);
  if (pickerInfo.cardId != null) {
    return {
      type: "card",
      key: `card:${pickerInfo.cardId}`,
      name: sourceInfo.displayName,
      href: Urls.card({ id: pickerInfo.cardId, name: sourceInfo.displayName }),
      model: getCardModel(sourceInfo),
    };
  }

  return {
    type: "table",
    key: `table:${pickerInfo.tableId}`,
    name: sourceInfo.displayName,
    href: getTableQueryUrl(query, source),
    tableId: pickerInfo.tableId,
    schemaName: sourceInfo.schema ?? null,
    description: sourceInfo.description ?? null,
  };
}

function getTableQueryUrl(
  query: Lib.Query,
  table: Lib.TableMetadata | Lib.CardMetadata,
) {
  const tableQuery = Lib.queryFromTableOrCardMetadata(query, table);
  return Urls.serializedQuestion({
    display: "table",
    visualization_settings: {},
    dataset_query: Lib.toJsQuery(tableQuery),
  });
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
              table={{ id: item.tableId, description: item.description }}
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
