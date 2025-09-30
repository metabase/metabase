import * as Yup from "yup";

export const GIT_SYNC_SCHEMA = Yup.object({
  "remote-sync-enabled": Yup.boolean().nullable().default(true),
  "remote-sync-url": Yup.string().nullable().default(null),
  "remote-sync-token": Yup.string().nullable().default(null),
  "remote-sync-type": Yup.string()
    .oneOf(["production", "development"] as const)
    .nullable()
    .default("production"),
  "remote-sync-branch": Yup.string().nullable().default("main"),
});
