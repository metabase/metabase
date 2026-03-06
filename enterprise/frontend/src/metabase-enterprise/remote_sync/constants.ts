import type { TagDescription } from "@reduxjs/toolkit/query";
import { t } from "ttag";
import * as Yup from "yup";

import {
  REMOTE_SYNC_TYPES,
  type RemoteSyncType,
} from "metabase-types/api/settings";

import { type EnterpriseTagType, tag } from "../api/tags";

export const URL_KEY = "remote-sync-url";
export const TOKEN_KEY = "remote-sync-token";
export const TYPE_KEY = "remote-sync-type";
export const BRANCH_KEY = "remote-sync-branch";
export const REMOTE_SYNC_KEY = "remote-sync-enabled";
export const AUTO_IMPORT_KEY = "remote-sync-auto-import";
export const TRANSFORMS_KEY = "remote-sync-transforms";
export const COLLECTIONS_KEY = "collections";
// Used in modal variant when library doesn't exist yet but user wants to sync it
export const SYNC_LIBRARY_PENDING_KEY = "sync-library-pending";

export const REMOTE_SYNC_SCHEMA = Yup.object({
  [REMOTE_SYNC_KEY]: Yup.boolean().nullable().default(true),
  [URL_KEY]: Yup.string()
    .nullable()
    .default(null)
    .test(
      "https-url",
      () =>
        t`Only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)`,
      (value) =>
        !value ||
        value.startsWith("https://") ||
        value.startsWith("http://") ||
        value.startsWith("file://"),
    ),
  [TOKEN_KEY]: Yup.string().nullable().default(null),
  [AUTO_IMPORT_KEY]: Yup.boolean().nullable().default(false),
  [TRANSFORMS_KEY]: Yup.boolean().nullable().default(false),
  [TYPE_KEY]: Yup.mixed<RemoteSyncType>()
    .oneOf([...REMOTE_SYNC_TYPES])
    .nullable()
    .default("read-only" as const),
  [BRANCH_KEY]: Yup.string().nullable().default("main"),
  [COLLECTIONS_KEY]: Yup.object().nullable().default({}),
  [SYNC_LIBRARY_PENDING_KEY]: Yup.boolean().nullable().default(false),
});

export const REMOTE_SYNC_INVALIDATION_TAGS: TagDescription<EnterpriseTagType>[] =
  [
    tag("collection-dirty-entities"),
    tag("collection-is-dirty"),
    tag("remote-sync-current-task"),
    tag("remote-sync-has-remote-changes"),
  ];
