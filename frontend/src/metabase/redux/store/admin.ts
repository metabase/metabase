import type { DatabaseId, Revision } from "metabase-types/api";

export type AdminPathKey =
  | "data-model"
  | "settings"
  | "metabot"
  | "people"
  | "databases"
  | "permissions"
  | "audit"
  | "help"
  | "performance"
  | "performance-models"
  | "performance-dashboards-and-questions"
  | "performance-databases";

export type AdminPath = {
  key: AdminPathKey;
  getName: () => string;
  path: string;
};

export type TemporaryPasswordsState = Record<number, string | null>;

export interface AdminState {
  app: AdminAppState;
  databases: {
    deletionError: null | unknown;
    deletes: DatabaseId[];
  };
  datamodel: {
    revisions: Revision[] | null;
  };
  people: {
    temporaryPasswords: TemporaryPasswordsState;
  };
}

export interface AdminAppState {
  paths: AdminPath[];
}
