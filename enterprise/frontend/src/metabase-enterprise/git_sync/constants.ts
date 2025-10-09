import * as Yup from "yup";

import { tag } from "../api/tags";

export const GIT_SYNC_SCHEMA = Yup.object({
  "remote-sync-enabled": Yup.boolean().nullable().default(true),
  "remote-sync-url": Yup.string().nullable().default(null),
  "remote-sync-token": Yup.string().nullable().default(null),
  "remote-sync-auto-import": Yup.boolean().nullable().default(false),
  "remote-sync-type": Yup.string()
    .oneOf(["production", "development"] as const)
    .nullable()
    .default("production"),
  "remote-sync-branch": Yup.string().nullable().default("main"),
});

export const GIT_SYNC_INVALIDATION_TAGS = [
  tag("collection-dirty-entities"),
  tag("collection-is-dirty"),
  tag("remote-sync-current-task"),
];
