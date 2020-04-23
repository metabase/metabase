import React from "react";

import Badge, { MaybeLink } from "metabase/components/Badge";

import { browseDatabase, browseSchema } from "metabase/lib/urls";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import cx from "classnames";

const QuestionDataSource = ({ question, subHead, noLink, ...props }) => {
  const parts = getDataSourceParts({ question, subHead, noLink });
  return subHead ? (
    <SubHeadBreadcrumbs parts={parts} {...props} />
  ) : (
    <HeadBreadcrumbs parts={parts} {...props} />
  );
};

QuestionDataSource.shouldRender = ({ question }) =>
  getDataSourceParts({ question }).length > 0;

function getDataSourceParts({ question, noLink, subHead }) {
  if (!question) {
    return [];
  }

  const parts = [];

  let query = question.query();
  if (query instanceof StructuredQuery) {
    query = query.rootQuery();
  }

  const database = query.database();
  if (database) {
    parts.push({
      icon: "database",
      name: database.displayName(),
      href: !noLink && database.id >= 0 && browseDatabase(database),
    });
  }

  const table = query.table();
  if (table && table.hasSchema()) {
    parts.push({
      icon: "folder",
      name: table.schema_name,
      href: !noLink && database.id >= 0 && browseSchema(table),
    });
  }

  const isObjectDetail = question.isObjectDetail();

  if (table) {
    let name = table.displayName();
    if (query instanceof StructuredQuery) {
      name = query.joins().reduce((name, join) => {
        const joinedTable = join.joinedTable();
        if (joinedTable) {
          return name + " + " + joinedTable.displayName();
        } else {
          return name;
        }
      }, name);
    }
    parts.push({
      icon: "table_spaced",
      name: name,
      href:
        !noLink && (subHead || isObjectDetail) && table.newQuestion().getUrl(),
    });
  }

  if (isObjectDetail) {
    parts.push({
      name: question.objectDetailPK(),
    });
  }

  return parts.filter(({ name, icon }) => name || icon);
}

export default QuestionDataSource;

const SubHeadBreadcrumbs = ({ parts, className, ...props }) => (
  <span {...props} className={className}>
    <span className="flex align-center flex-wrap mbn1">
      {parts.map(({ name, icon, href }, index) => (
        <Badge key={index} className="mr2 mb1" icon={icon} to={href}>
          {name}
        </Badge>
      ))}
    </span>
  </span>
);

const HeadBreadcrumbs = ({ parts, ...props }) => (
  <span {...props} className="flex align-center flex-wrap">
    {parts.map(({ name, icon, href }, index) => [
      <MaybeLink
        key={index}
        to={href}
        className={cx("flex align-center", href ? "text-medium" : "text-dark")}
      >
        {name}
      </MaybeLink>,
      index < parts.length - 1 ? (
        <span key={index + "-divider"} className="mx1 text-light text-smaller">
          •
        </span>
      ) : null,
    ])}
  </span>
);
