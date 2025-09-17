import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";
import type { SettingDefinition } from "metabase-types/api";

const REQUIRED_SCHEMA = {
  is: (isEnabled: boolean, setting?: SettingDefinition) =>
    isEnabled && !setting?.is_env_setting,
  then: (schema: Yup.AnySchema) => schema.required(Errors.required),
};

export const GIT_SYNC_SCHEMA = Yup.object({
  "git-sync-enabled": Yup.boolean().nullable().default(false),
  "git-sync-url": Yup.string()
    .nullable()
    .default(null)
    .when(["git-sync-enabled", "$git-sync-url"], REQUIRED_SCHEMA),
  "git-sync-token": Yup.string()
    .nullable()
    .default(null)
    .when(["git-sync-enabled", "$git-sync-token"], REQUIRED_SCHEMA),
  "git-sync-type": Yup.string()
    .oneOf(["import", "export"] as const)
    .nullable()
    .default("import"),
  "git-sync-import-branch": Yup.string().nullable().default("main"),
  "git-sync-export-branch": Yup.string().nullable().default("main"),
});
