import fs from "node:fs";
import { fileURLToPath } from "node:url";

// A namespace import stays single-line so the disable covers the reported line.
// eslint-disable-next-line metabase/no-external-references-for-sdk-package-code
import * as dataAppVirtualModules from "build-configs/embedding-sdk/constants/data-app-virtual-modules";

import {
  DATA_APP_BUNDLE_URL,
  DATA_APP_REBUILT_EVENT,
} from "../constants/bundle";
import { DATA_APP_DEV_ENTRY_FILE_NAME } from "../constants/paths";

const { DATA_APP_DEV_CONFIG_VIRTUAL_ID, DATA_APP_DEV_ENTRY_VIRTUAL_ID } =
  dataAppVirtualModules;

// Rollup's virtual-module marker: a leading NUL tells plugins the id is synthetic.
const RESOLVED_PREFIX = "\0";

const DEV_ENTRY_SOURCE_PATH = fileURLToPath(
  new URL(DATA_APP_DEV_ENTRY_FILE_NAME, import.meta.url),
);

export const resolveDataAppVirtualId = (id: string): string | undefined =>
  id === DATA_APP_DEV_ENTRY_VIRTUAL_ID || id === DATA_APP_DEV_CONFIG_VIRTUAL_ID
    ? RESOLVED_PREFIX + id
    : undefined;

export interface DataAppVirtualConfig {
  appSlug: string;
  allowedHosts: string[];
}

export const loadDataAppVirtualModule = (
  id: string,
  { appSlug, allowedHosts }: DataAppVirtualConfig,
): string | undefined => {
  if (id === RESOLVED_PREFIX + DATA_APP_DEV_ENTRY_VIRTUAL_ID) {
    return fs.readFileSync(DEV_ENTRY_SOURCE_PATH, "utf8");
  }

  if (id === RESOLVED_PREFIX + DATA_APP_DEV_CONFIG_VIRTUAL_ID) {
    return [
      `export const allowedHosts = ${JSON.stringify(allowedHosts)};`,
      `export const appSlug = ${JSON.stringify(appSlug)};`,
      `export const bundleUrl = ${JSON.stringify(DATA_APP_BUNDLE_URL)};`,
      `export const rebuiltEvent = ${JSON.stringify(DATA_APP_REBUILT_EVENT)};`,
    ].join("\n");
  }
};
