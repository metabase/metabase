import _ from "underscore";

import Question from "metabase-lib/lib/Question";

import type {
  ClickObject,
  QueryMode,
} from "metabase-types/types/Visualization";

const columnNameToUrl = {
  user_id: value => `/admin/audit/member/${value}`,
  viewed_by_id: value => `/admin/audit/member/${value}`,
  saved_by_id: value => `/admin/audit/member/${value}`,
  dashboard_id: value => `/admin/audit/dashboard/${value}`,
  card_id: value => `/admin/audit/question/${value}`,
  database_id: value => `/admin/audit/database/${value}`,
  // NOTE: disable schema links until schema detail is implemented
  // schema: value => `/admin/audit/schema/${value}`,
  table_id: value => `/admin/audit/table/${value}`,
  // NOTE: query_hash uses standard Base64 encoding which isn't URL safe so make sure to escape it
  query_hash: value =>
    `/admin/audit/query/${encodeURIComponent(String(value))}`,
};

const AuditDrill = ({
  question,
  clicked,
}: {
  question: Question,
  clicked?: ClickObject,
}) => {
  if (!clicked) {
    return [];
  }
  const metricAndDimensions = [clicked].concat(clicked.dimensions || []);
  for (const { column, value } of metricAndDimensions) {
    if (column && columnNameToUrl[column.name] != null && value != null) {
      return [
        {
          name: "detail",
          title: `View this`,
          default: true,
          url() {
            return columnNameToUrl[column.name](value);
          },
        },
      ];
    }
  }

  // NOTE: special case for showing query detail links for ad-hoc queries in the card id column
  const { column, origin } = clicked;
  if (origin && column && column.name === "card_id") {
    const queryHashColIndex = _.findIndex(
      origin.cols,
      col => col.name === "query_hash",
    );
    const value = origin.row[queryHashColIndex];
    if (value) {
      return [
        {
          name: "detail",
          title: `View this`,
          default: true,
          url() {
            return `/admin/audit/query/${encodeURIComponent(String(value))}`;
          },
        },
      ];
    }
  }
  return [];
};

export const AuditMode: QueryMode = {
  name: "audit",
  drills: () => [AuditDrill],
};
