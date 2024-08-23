import { t } from "ttag";

import type { CardError } from "metabase-types/api";

export const formatErrorString = (errors: CardError[]) => {
  const messages = [];

  const inactiveFields = errors.filter(
    error => error.type === "inactive-field",
  );
  const unknownFields = errors.filter(error => error.type === "unknown-field");
  const inactiveTables = errors.filter(
    error => error.type === "inactive-table",
  );
  const unknownTables = errors.filter(error => error.type === "unknown-table");

  if (inactiveFields.length > 0) {
    messages.push(
      t`Field ${inactiveFields
        .map(field => field.field)
        .join(", ")} is inactive`,
    );
  }

  if (inactiveTables.length > 0) {
    messages.push(
      t`Table ${inactiveTables
        .map(table => table.table)
        .join(", ")} is inactive`,
    );
  }

  if (unknownFields.length > 0) {
    messages.push(
      t`Field ${unknownFields.map(field => field.field).join(", ")} is unknown`,
    );
  }

  if (unknownTables.length > 0) {
    messages.push(
      t`Table ${unknownTables.map(table => table.table).join(", ")} is unknown`,
    );
  }

  if (messages.length > 0) {
    return messages.join(", ");
  } else {
    return "I don't know what's wrong, but it's broken";
  }
};
