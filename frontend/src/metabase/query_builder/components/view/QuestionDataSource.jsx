/* eslint-disable react/prop-types */
import React from "react";
import * as Urls from "metabase/lib/urls";
import { HeadBreadcrumbs } from "./HeaderBreadcrumbs";

function QuestionDataSource({ question, subHead, isObjectDetail, ...props }) {
  const parts = getDataSourceParts({
    question,
    subHead,
    isObjectDetail,
  });
  return (
    <HeadBreadcrumbs
      parts={parts}
      variant={subHead ? "subhead" : "head"}
      {...props}
    />
  );
}

QuestionDataSource.shouldRender = ({ question, isObjectDetail }) =>
  getDataSourceParts({ question, isObjectDetail }).length > 0;

function getDataSourceParts({ question, subHead, isObjectDetail }) {
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
      href: database.id >= 0 && Urls.browseDatabase(database),
    });
  }

  const table = query.table();
  if (table && table.hasSchema()) {
    parts.push({
      name: table.schema_name,
      href: database.id >= 0 && Urls.browseSchema(table),
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
      href: (subHead || isObjectDetail) && table.newQuestion().getUrl(),
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
