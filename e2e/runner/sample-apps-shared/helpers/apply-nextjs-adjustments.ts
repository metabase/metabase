import fs from "fs";

import glob from "glob";
import path from "path";

import { logWithPrefix } from "./log-with-prefix";

const USE_CLIENT_DIRECTIVE = "'use client';";
const DYNAMIC_API_ROUTE_MARKER = "export const dynamic = 'force-dynamic';";

// Next.js performs a route request at build time and caches it.
// It is done before we mocked a user in a test, so the failed auth response is cached.
// To avoid this behavior we should disable API route caching.
function disableAppApiRoutesCaching({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  const apiRouteFiles = glob.sync(
    path.join(installationPath, "src/**/api/**/route.ts"),
  );

  apiRouteFiles.forEach(file => {
    fs.appendFileSync(file, DYNAMIC_API_ROUTE_MARKER, "utf8");
    logWithPrefix(`Updating cache settings in: ${file}`, loggerPrefix);
  });
}

// For app router components we should append `use client` directive in order to make entity id injection working
function prependAppRouterUseClientDirective({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  const files = glob.sync(path.join(installationPath, "src/app/**/*.tsx"), {
    ignore: [path.join(installationPath, "src/app/*.tsx")],
  });

  files.forEach(file => {
    const content = fs.readFileSync(file, "utf8");

    const isAlreadyClientSide = /['"]use client['"]/.test(content);

    if (isAlreadyClientSide) {
      return;
    }

    const updated = `${USE_CLIENT_DIRECTIVE}\n${content}`;

    fs.writeFileSync(file, updated, "utf8");
    logWithPrefix(
      `Adding the \`use client\` directive in: ${file}`,
      loggerPrefix,
    );
  });
}

export function applyNextJsAdjustments({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  disableAppApiRoutesCaching({ installationPath, loggerPrefix });
  prependAppRouterUseClientDirective({ installationPath, loggerPrefix });
}
