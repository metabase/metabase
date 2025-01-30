import fs from "fs";

import glob from "glob";
import path from "path";

import { INJECTED_ENTITY_ID_GETTER_FUNCTION_NAME } from "../../../support/constants/embedding-sdk";
import type {
  EntityTypeToInjectIds,
  InjectedEntityIdGetterParameters,
} from "../../../support/types/embedding-sdk";

import { logWithPrefix } from "./log-with-prefix";

const ENTITY_TYPES_TO_INJECT_IDS: EntityTypeToInjectIds[] = [
  "collection",
  "dashboard",
  "question",
];

// Replaces hardcoded entity ids with getters
function replaceEntityIdsForEntityType({
  fileName,
  content,
  idAttributeName,
  entityType,
  withTypes,
}: {
  fileName: string;
  content: string;
  idAttributeName: string;
  entityType: EntityTypeToInjectIds;
  withTypes: boolean;
}) {
  let occurrenceIndex = 0;

  const entityIdUsageRegExp = new RegExp(`${idAttributeName}={([^}]*)}`, "g");
  const hasEntityIdUsage = entityIdUsageRegExp.test(content);

  if (!hasEntityIdUsage) {
    return content;
  }

  return content.replace(entityIdUsageRegExp, (_, originalValue) => {
    const globalThis = withTypes ? "(globalThis as any)" : "globalThis";

    const params: InjectedEntityIdGetterParameters = {
      fileName,
      entityType,
      occurrenceIndex: occurrenceIndex++,
    };
    const stringifyParams = JSON.stringify(params);

    return `${idAttributeName}={
      typeof ${globalThis}.${INJECTED_ENTITY_ID_GETTER_FUNCTION_NAME} === "function"
        ? ${globalThis}.${INJECTED_ENTITY_ID_GETTER_FUNCTION_NAME}(${stringifyParams}) ?? ${originalValue}
        : ${originalValue}
    }`;
  });
}

export function setupEntityIdsInjection({
  installationPath,
  loggerPrefix,
}: {
  installationPath: string;
  loggerPrefix: string;
}) {
  const files = glob.sync(path.join(installationPath, "src/**/*.{tsx,jsx}"));

  files.forEach(file => {
    const fileName = path.basename(file);
    const extension = path.extname(file);
    const isTypescriptFile = extension === ".tsx";

    const content = fs.readFileSync(file, "utf8");

    const updated = ENTITY_TYPES_TO_INJECT_IDS.reduce((updated, entityType) => {
      return replaceEntityIdsForEntityType({
        fileName,
        content: updated,
        idAttributeName: `${entityType}Id`,
        entityType,
        withTypes: isTypescriptFile,
      });
    }, content);

    if (updated !== content) {
      fs.writeFileSync(file, updated, "utf8");

      logWithPrefix(
        `Reading entity ids from \`globalThis\` in: ${file}`,
        loggerPrefix,
      );
    }
  });
}
