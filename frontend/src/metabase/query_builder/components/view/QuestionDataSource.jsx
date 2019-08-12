import React from "react";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { browseDatabase, browseSchema } from "metabase/lib/urls";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";

import cx from "classnames";

const QuestionDataSource = ({
  question,
  query = question.query(),
  subHead,
  noLink,
}) => {
  const parts = [];

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
      name: table.schema,
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

  return subHead ? (
    <SubHeadBreadcrumbs parts={parts} />
  ) : (
    <HeadBreadcrumbs parts={parts} />
  );
};

export default QuestionDataSource;

const SubHeadBreadcrumbs = ({ parts }) => (
  <span className="flex align-center text-medium text-bold">
    {parts.map(({ name, icon, href }, index) => (
      <MaybeLink key={index} to={href} className="flex align-center mr2">
        {icon && <Icon name={icon} mr={"5px"} size={11} />}
        {name}
      </MaybeLink>
    ))}
  </span>
);

const HeadBreadcrumbs = ({ parts }) => (
  <span className="flex align-center">
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

const MaybeLink = ({ to, className, ...props }) =>
  to ? (
    <Link to={to} {...props} className={cx(className, "text-brand-hover")} />
  ) : (
    <span {...props} className={className} />
  );
