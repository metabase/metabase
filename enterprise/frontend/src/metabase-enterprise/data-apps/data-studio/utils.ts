import { t } from "ttag";

import type { DataApp } from "metabase-types/api";

type DataAppState = Pick<DataApp, "enabled" | "outdated">;

export function getDataAppStatusLabel({ enabled, outdated }: DataAppState) {
  if (enabled) {
    return outdated ? t`Live, outdated` : t`Live`;
  }

  return outdated ? t`Draft, outdated` : t`Draft`;
}

export function isDataAppOpenable({ enabled, outdated }: DataAppState) {
  return enabled && !outdated;
}

const DATA_APPS_DIR = "data_apps";
const WEB_URL_PATTERN = /^https?:\/\//i;

type DataAppSourceLocation =
  | { type: "link"; url: string }
  | { type: "text"; text: string };

/**
 * Where a data app's folder is in the Remote Sync repository. Links to the
 * folder on GitHub and GitLab, the only hosts whose folder URLs are known.
 * Otherwise gives text: the folder in a local repository, which a browser
 * can't open, written like the repository's `file://` URL or path, or the
 * repository URL without credentials.
 */
export function getDataAppSourceLocation({
  repoUrl,
  branch,
  slug,
}: {
  repoUrl: string;
  branch: string | null | undefined;
  slug: string;
}): DataAppSourceLocation {
  const folder = `${DATA_APPS_DIR}/${slug}`;

  if (!WEB_URL_PATTERN.test(repoUrl)) {
    return {
      type: "text",
      text: `${repoUrl.replace(/\/+$/, "")}/${folder}`,
    };
  }

  if (!URL.canParse(repoUrl)) {
    return {
      type: "text",
      text: repoUrl,
    };
  }

  const url = new URL(repoUrl);

  // A pasted clone URL can embed a token (`https://user:token@host/...`); keep it off the page.
  url.username = "";
  url.password = "";

  const folderRoute = getFolderRoute(url.hostname);

  if (folderRoute === null || !branch) {
    return {
      type: "text",
      text: url.toString(),
    };
  }

  const repoPath = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  url.pathname = `${repoPath}/${folderRoute}/${encodePathSegments(branch)}/${folder}`;

  return {
    type: "link",
    url: url.toString(),
  };
}

// Self-hosted GitHub and GitLab keep their product name in the host name.
function getFolderRoute(hostname: string) {
  if (hostname.includes("github")) {
    return "tree";
  }

  if (hostname.includes("gitlab")) {
    return "-/tree";
  }

  return null;
}

// The `pathname` setter leaves `%` as it is, so a branch like `100%-done` would read as an escape.
function encodePathSegments(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}
