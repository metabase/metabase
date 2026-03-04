import { type ReactElement, isValidElement } from "react";

import { TableInfoIcon } from "metabase/common/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { getIcon } from "metabase/lib/icon";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import * as ML_Urls from "metabase-lib/v1/urls";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";
import HeaderS from "../HeaderBreadcrumbs/HeaderBreadcrumbs.module.css";

import S from "./QuestionDataSource.module.css";

export type DataSourcePart = ReactElement | DataSourceBadgePart;

type DataSourceBadgePart = {
  name?: string;
  href?: string;
  icon?: IconName;
  model?: "database" | "schema" | "table" | "question" | "model" | "metric";
};

export function getDataSourceParts({
  question,
  subHead,
  isObjectDetail,
  formatTableAsComponent = true,
}: {
  question: Question;
  subHead?: boolean;
  isObjectDetail?: boolean;
  formatTableAsComponent?: boolean;
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

  const table = !isNative
    ? metadata.table(Lib.sourceTableOrCardId(query))
    : (question.legacyNativeQuery() as NativeQuery).table();
  if (table && table.hasSchema()) {
    const isBasedOnSavedQuestion = isVirtualCardId(table.id);
    if (database != null && !isBasedOnSavedQuestion) {
      parts.push({
        model: "schema",
        name: table.schema_name,
        href: database.id >= 0 ? Urls.browseSchema(table) : undefined,
      });
    }
  }

  if (table) {
    const hasTableLink = subHead || isObjectDetail;
    if (isNative) {
      return [
        {
          name: table.displayName(),
          href: hasTableLink ? getTableURL(table) : "",
        },
      ];
    }

    const allTables = [
      table,
      ...Lib.joins(query, -1)
        .map((join) => Lib.pickerInfo(query, Lib.joinedThing(query, join)))
        .map((pickerInfo) => {
          if (pickerInfo?.tableId != null) {
            return metadata.table(pickerInfo.tableId);
          }

          if (pickerInfo?.cardId != null) {
            return metadata.table(getQuestionVirtualTableId(pickerInfo.cardId));
          }

          return undefined;
        }),
    ].filter(isNotNull);

    const part: DataSourcePart = formatTableAsComponent ? (
      <QuestionTableBadges
        tables={allTables}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />
    ) : (
      {
        name: table.displayName(),
        href: hasTableLink ? getTableURL(table) : "",
        model: table.type ?? "table",
      }
    );

    parts.push(part);
  }

  return parts.filter(
    (part) =>
      isValidElement(part) ||
      ("name" in part && part.name) ||
      ("icon" in part && part.icon),
  );
}

type QuestionTableBadgesProps = {
  tables: Table[];
  subHead?: boolean;
  hasLink?: boolean;
  isLast?: boolean;
};

function QuestionTableBadges({
  tables,
  subHead,
  hasLink,
  isLast,
}: QuestionTableBadgesProps) {
  const badgeInactiveColor =
    isLast && !subHead ? "text-primary" : "text-tertiary";

  const parts = tables.map((table) => (
    <HeadBreadcrumbs.Badge
      key={table.id}
      to={hasLink ? getTableURL(table) : ""}
      inactiveColor={badgeInactiveColor}
    >
      <span>
        {table.displayName()}
        {!subHead && (
          <span className={S.IconWrapper}>
            <TableInfoIcon
              table={table}
              icon="info"
              size={16}
              position="bottom"
              className={HeaderS.HeaderBadgeIcon}
            />
          </span>
        )}
      </span>
    </HeadBreadcrumbs.Badge>
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
  if (isVirtualCardId(table.id)) {
    const cardId = getQuestionIdFromVirtualTableId(table.id);
    if (cardId != null) {
      return Urls.question({ id: cardId, name: table.displayName() });
    }
  }
  return ML_Urls.getUrl(table.newQuestion());
}

export function getQuestionIcon(question: Question): IconName {
  return getIcon({ model: "card", type: question.type() }).name;
}
