import React from "react";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { browseDatabase, browseSchema } from "metabase/lib/urls";

import cx from "classnames";

const QuestionDataSource = ({
  question,
  query = question.query(),
  subHead,
  noLink,
}) => {
  const parts = [];

  const database = query.database();
  if (database) {
    parts.push({
      icon: "database",
      name: database.displayName(),
      href: !noLink && browseDatabase(database),
    });
  }

  const table = query.table();
  if (table && table.hasSchema()) {
    parts.push({
      icon: "folder",
      name: table.schema,
      href: !noLink && browseSchema(table),
    });
  }
  if (table) {
    parts.push({
      icon: "table2",
      name: table.displayName(),
      href: !noLink && subHead && table.newQuestion().getUrl(),
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
        {icon && <Icon name={icon} className="mr1" size={12} />}
        {name}
      </MaybeLink>
    ))}
  </span>
);

const HeadBreadcrumbs = ({ parts }) => (
  <span className="flex align-center mr2">
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
