/* eslint-disable react/prop-types */
import React from "react";
import { browseDatabase, browseSchema } from "metabase/lib/urls";
import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";

const QuestionDataSource = ({
  question,
  subHead,
  noLink,
  isObjectDetail,
  ...props
}) => {
  const parts = getDataSourceParts({
    question,
    subHead,
    noLink,
    isObjectDetail,
  });
  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
      {...props}
    />
  );
};

QuestionDataSource.shouldRender = ({ question, isObjectDetail }) =>
  getDataSourceParts({ question, isObjectDetail }).length > 0;

function getDataSourceParts({ question, noLink, subHead, isObjectDetail }) {
  if (!question) {
    return [];
  }

  const parts = [];

  let query = question.query();
  const isStructuredQuery = question.isStructured();

  if (isStructuredQuery) {
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
      name: table.schema_name,
      href: !noLink && database.id >= 0 && browseSchema(table),
    });
  }

  if (table) {
    let name = table.displayName();
    if (isStructuredQuery) {
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
