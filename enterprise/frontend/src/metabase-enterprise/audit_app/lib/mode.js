import { push } from "react-router-redux";
import _ from "underscore";

export const getColumnName = column => column.remapped_to || column.name;

export const getRowValuesByColumns = (row, cols) =>
  cols.reduce((acc, col, index) => {
    const columnName = getColumnName(col);
    return {
      ...acc,
      [columnName]: row[index],
    };
  }, {});

export const columnNameToUrl = {
  // No admin page for collections but still want to link to it
  collection_id: value => `/collection/${value}`,
  user_id: value => `/admin/audit/member/${value}`,
  creator_id: value => `/admin/audit/member/${value}`,
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
  recipients: (_, clicked) => {
    const pulseIdIndex = clicked.origin.cols.findIndex(
      col => getColumnName(col) === "pulse_id",
    );
    const pulseId = clicked.origin.row[pulseIdIndex];

    return clicked.extraData.type === "subscription"
      ? `/admin/audit/subscriptions/subscriptions/${pulseId}/edit`
      : `/admin/audit/subscriptions/alerts/${pulseId}/edit`;
  },
};

const AuditDrill = ({ question, clicked }) => {
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
          action() {
            const url = columnNameToUrl[column.name](value, clicked);
            return push(url);
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
          action() {
            return push(
              `/admin/audit/query/${encodeURIComponent(String(value))}`,
            );
          },
        },
      ];
    }
  }
  return [];
};

export const AuditMode = {
  name: "audit",
  clickActions: [AuditDrill],
};
