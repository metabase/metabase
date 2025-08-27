import type { Table } from "metabase-types/api";

export const getEntityIcon = (entityType?: Table["entity_type"]) => {
  switch (entityType) {
    case "entity/UserTable":
      return "person";
    case "entity/CompanyTable":
      return "globe";
    case "entity/TransactionTable":
      return "index";
    case "entity/SubscriptionTable":
      return "sync";
    case "entity/ProductTable":
    case "entity/EventTable":
    case "entity/GenericTable":
    default:
      return "document";
  }
};
