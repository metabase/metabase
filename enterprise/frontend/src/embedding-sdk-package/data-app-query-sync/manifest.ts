import fs from "node:fs";
import path from "node:path";

const ENTITY_ID_PATTERN = /^[-_0-9A-Za-z]{21}$/;

type ResourceEntityIds = {
  resourceCollectionEntityId: string;
  permissionGroupEntityId: string;
};

function validateEntityId(name: string, value: string): void {
  if (!ENTITY_ID_PATTERN.test(value)) {
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- CLI protocol error names the remote service.
    throw new Error(`Metabase returned an invalid ${name}.`);
  }
}

function addTopLevelValuesAfterPath(
  content: string,
  values: Array<[name: string, value: string]>,
): string {
  const missingValues = values.filter(
    ([name]) => !new RegExp(`^${name}\\s*:`, "m").test(content),
  );

  if (missingValues.length === 0) {
    return content;
  }

  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";

  const block = missingValues
    .map(([name, value]) => `${name}: ${value}`)
    .join(lineEnding);

  const pathLine = /^path\s*:[^\r\n]*/m.exec(content);

  if (pathLine?.index === undefined) {
    throw new Error("data_app.yaml must define a path.");
  }

  const insertAt = pathLine.index + pathLine[0].length;

  return `${content.slice(0, insertAt)}${lineEnding}${block}${content.slice(insertAt)}`;
}

export function addResourceEntityIdsToManifest(
  appRoot: string,
  { resourceCollectionEntityId, permissionGroupEntityId }: ResourceEntityIds,
): void {
  validateEntityId("resource_collection_entity_id", resourceCollectionEntityId);
  validateEntityId("permission_group_entity_id", permissionGroupEntityId);

  const manifestPath = path.join(appRoot, "data_app.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No data_app.yaml found in ${appRoot}.`);
  }

  const content = fs.readFileSync(manifestPath, "utf8");
  const nextContent = addTopLevelValuesAfterPath(content, [
    ["resource_collection_entity_id", resourceCollectionEntityId],
    ["permission_group_entity_id", permissionGroupEntityId],
  ]);

  if (nextContent !== content) {
    fs.writeFileSync(manifestPath, nextContent);
  }
}
