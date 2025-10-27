import * as Yup from "yup";

import { tag } from "../api/tags";

export const URL_KEY = "remote-sync-url";
export const TOKEN_KEY = "remote-sync-token";
export const TYPE_KEY = "remote-sync-type";
export const BRANCH_KEY = "remote-sync-branch";
export const REMOTE_SYNC_KEY = "remote-sync-enabled";
export const AUTO_IMPORT_KEY = "remote-sync-auto-import";

export const REMOTE_SYNC_SCHEMA = Yup.object({
  [REMOTE_SYNC_KEY]: Yup.boolean().nullable().default(true),
  [URL_KEY]: Yup.string().nullable().default(null),
  [TOKEN_KEY]: Yup.string().nullable().default(null),
  [AUTO_IMPORT_KEY]: Yup.boolean().nullable().default(false),
  [TYPE_KEY]: Yup.string()
    .oneOf(["production", "development"] as const)
    .nullable()
    .default("production"),
  [BRANCH_KEY]: Yup.string().nullable().default("main"),
});

export const REMOTE_SYNC_INVALIDATION_TAGS = [
  tag("collection-dirty-entities"),
  tag("collection-is-dirty"),
  tag("remote-sync-current-task"),
];
