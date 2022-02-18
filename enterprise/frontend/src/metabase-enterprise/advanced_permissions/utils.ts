import { User } from "metabase-types/api";
import { Database } from "metabase-types/types/Database";
import { Table } from "metabase-types/types/Table";

export const canAccessSettings = (user: User) => canAccessDataModel(user);

export const canAccessDataModel = ({ can_access_data_model }: User) =>
  can_access_data_model;

export const canEditEntityDataModel = (entity: Table | Database | null) =>
  entity?.data_model_permission == null ||
  entity?.data_model_permission === "write";
