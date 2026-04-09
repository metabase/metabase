import { type ReactElement, isValidElement } from "react";

import { TableInfoIcon } from "metabase/common/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { getIcon } from "metabase/lib/icon";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import Table from "metabase-lib/v1/metadata/Table";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { TableId } from "metabase-types/api";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs/HeaderBreadcrumbs";
import HeaderS from "../HeaderBreadcrumbs/HeaderBreadcrumbs.module.css";

import S from "./QuestionDataSource.module.css";

export type DataSourcePart = ReactElement | DataSourceBadgePart;

// TODO (AlexP, 2026-01-30): All of this should be rewritten to use MBQL lib and not use Metadata directly.

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

  const tableOrQuestion = !isNative
    ? getTableOrQuestion(metadata, Lib.sourceTableOrCardId(query))
    : (question.legacyNativeQuery() as NativeQuery).table();
  if (
    tableOrQuestion &&
    tableOrQuestion instanceof Table &&
    tableOrQuestion.hasSchema()
  ) {
    const isBasedOnSavedQuestion = isVirtualCardId(tableOrQuestion.id);
    if (database != null && !isBasedOnSavedQuestion) {
      parts.push({
        model: "schema",
        name: tableOrQuestion.schema_name,
        href: database.id >= 0 ? Urls.browseSchema(tableOrQuestion) : undefined,
      });
    }
  }

  if (tableOrQuestion) {
    const hasTableLink = subHead || isObjectDetail;
    if (isNative) {
      return [
        {
          name: tableOrQuestion.displayName() ?? "",
          href: hasTableLink ? getTableOrQuestionUrl(tableOrQuestion) : "",
        },
      ];
    }

    const allTablesOrQuestions = [
      tableOrQuestion,
      ...Lib.joins(query, -1)
        .map((join) => Lib.pickerInfo(query, Lib.joinedThing(query, join)))
        .map((pickerInfo) => {
          if (pickerInfo?.tableId != null) {
            return getTableOrQuestion(metadata, pickerInfo.tableId);
          }

          if (pickerInfo?.cardId != null) {
            return getTableOrQuestion(
              metadata,
              getQuestionVirtualTableId(pickerInfo.cardId),
            );
          }

          return undefined;
        }),
    ].filter(isNotNull);

    const part: DataSourcePart = formatTableAsComponent ? (
      <QuestionTableBadges
        tablesOrQuestions={allTablesOrQuestions}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />
    ) : (
      {
        name: tableOrQuestion.displayName() ?? "",
        href: hasTableLink ? getTableOrQuestionUrl(tableOrQuestion) : "",
        model:
          tableOrQuestion instanceof Table ? "table" : tableOrQuestion.type(),
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
  tablesOrQuestions: (Table | Question)[];
  subHead?: boolean;
  hasLink?: boolean;
  isLast?: boolean;
};

function QuestionTableBadges({
  tablesOrQuestions,
  subHead,
  hasLink,
  isLast,
}: QuestionTableBadgesProps) {
  const badgeInactiveColor =
    isLast && !subHead ? "text-primary" : "text-tertiary";

  const parts = tablesOrQuestions.map((tableOrQuestion) => {
    const tableOrCard =
      tableOrQuestion instanceof Question
        ? tableOrQuestion.card()
        : tableOrQuestion;

    return (
      <HeadBreadcrumbs.Badge
        key={tableOrCard.id}
        to={hasLink ? getTableOrQuestionUrl(tableOrQuestion) : ""}
        inactiveColor={badgeInactiveColor}
      >
        <span>
          {tableOrQuestion.displayName()}
          {!subHead && (
            <span className={S.IconWrapper}>
              <TableInfoIcon
                table={tableOrCard}
                icon="info"
                size={16}
                position="bottom"
                className={HeaderS.HeaderBadgeIcon}
              />
            </span>
          )}
        </span>
      </HeadBreadcrumbs.Badge>
    );
  });

  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
      divider={<span className={S.TablesDivider}>+</span>}
      data-testid="question-table-badges"
    />
  );
}

function getTableOrQuestion(metadata: Metadata, id: TableId | null) {
  return (
    metadata.table(id) ?? metadata.question(getQuestionIdFromVirtualTableId(id))
  );
}

function getTableOrQuestionUrl(tableOrQuestion: Table | Question) {
  if (tableOrQuestion instanceof Question) {
    return Urls.question(tableOrQuestion.card());
  }
  if (isVirtualCardId(tableOrQuestion.id)) {
    const cardId = getQuestionIdFromVirtualTableId(tableOrQuestion.id);
    if (cardId != null) {
      return Urls.question({ id: cardId, name: tableOrQuestion.displayName() });
    }
  }
  return ML_Urls.getUrl(tableOrQuestion.newQuestion());
}

export function getQuestionIcon(question: Question): IconName {
  return getIcon({ model: "card", type: question.type() }).name;
}
