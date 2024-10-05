import PropTypes from "prop-types";
import { isValidElement } from "react";

import { TableInfoIcon } from "metabase/components/MetadataInfo/TableInfoIcon/TableInfoIcon";
import { isNotNull } from "metabase/lib/types";
import * as Urls from "metabase/lib/urls";
import * as Lib from "metabase-lib";
import {
  getQuestionIdFromVirtualTableId,
  getQuestionVirtualTableId,
  isVirtualCardId,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import * as ML_Urls from "metabase-lib/v1/urls";

import { HeadBreadcrumbs } from "../HeaderBreadcrumbs";

import { IconWrapper, TablesDivider } from "./QuestionDataSource.styled";

export function getDataSourceParts({
  question,
  subHead,
  isObjectDetail,
  // Set TableComponent to null to make this function return only objects
  TableComponent = QuestionTableBadges,
}) {
  if (!question) {
    return [];
  }

  const query = question.query();
  const { isEditable, isNative } = Lib.queryDisplayInfo(query);

  const hasDataPermission = isEditable;
  if (!hasDataPermission) {
    return [];
  }

  const parts = [];

  const metadata = question.metadata();
  const database = metadata.database(Lib.databaseID(query));

  if (database) {
    parts.push({
      icon: !subHead ? "database" : undefined,
      name: database.displayName(),
      href: database.id >= 0 && Urls.browseDatabase(database),
      model: "database",
    });
  }

  const table = !isNative
    ? metadata.table(Lib.sourceTableOrCardId(query))
    : question.legacyQuery().table();
  if (table && table.hasSchema()) {
    const isBasedOnSavedQuestion = isVirtualCardId(table.id);
    if (!isBasedOnSavedQuestion) {
      parts.push({
        model: "question",
        name: table.schema_name,
        href: database.id >= 0 && Urls.browseSchema(table),
      });
    }
  }

  if (table) {
    const hasTableLink = subHead || isObjectDetail;
    if (isNative) {
      return {
        name: table.displayName(),
        link: hasTableLink ? getTableURL() : "",
      };
    }

    const allTables = [
      table,
      ...Lib.joins(query, -1)
        .map(join => Lib.pickerInfo(query, Lib.joinedThing(query, join)))
        .map(pickerInfo => {
          if (pickerInfo?.tableId != null) {
            return metadata.table(pickerInfo.tableId);
          }

          if (pickerInfo?.cardId != null) {
            return metadata.table(getQuestionVirtualTableId(pickerInfo.cardId));
          }

          return undefined;
        }),
    ].filter(isNotNull);

    const part = isValidElement(TableComponent) ? (
      <TableComponent
        tables={allTables}
        subHead={subHead}
        hasLink={hasTableLink}
        isLast={!isObjectDetail}
      />
    ) : (
      {
        name: table.displayName(),
        href: hasTableLink ? getTableURL(table) : "",
        model: "table",
      }
    );

    parts.push(part);
  }

  return parts.filter(part => isValidElement(part) || part.name || part.icon);
}

QuestionTableBadges.propTypes = {
  tables: PropTypes.arrayOf(PropTypes.object).isRequired,
  hasLink: PropTypes.bool,
  subHead: PropTypes.bool,
  isLast: PropTypes.bool,
};

function QuestionTableBadges({ tables, subHead, hasLink, isLast }) {
  const badgeInactiveColor = isLast && !subHead ? "text-dark" : "text-light";

  const parts = tables.map(table => (
    <HeadBreadcrumbs.Badge
      key={table.id}
      to={hasLink ? getTableURL(table) : ""}
      inactiveColor={badgeInactiveColor}
    >
      <span>
        {table.displayName()}
        {!subHead && (
          <IconWrapper>
            <TableInfoIcon
              table={table}
              icon="info_filled"
              size={12}
              position="bottom"
            />
          </IconWrapper>
        )}
      </span>
    </HeadBreadcrumbs.Badge>
  ));

  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
      divider={<TablesDivider>+</TablesDivider>}
      data-testid="question-table-badges"
    />
  );
}

function getTableURL(table) {
  if (isVirtualCardId(table.id)) {
    const cardId = getQuestionIdFromVirtualTableId(table.id);
    return Urls.question({ id: cardId, name: table.displayName() });
  }
  return ML_Urls.getUrl(table.newQuestion());
}
