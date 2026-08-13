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

function addTopLevelValue(
  content: string,
  name: string,
  value: string,
): string {
  if (new RegExp(`^${name}\\s*:`, "m").test(content)) {
    return content;
  }

  const newline = content.endsWith("\n") || content.length === 0 ? "" : "\n";
  return `${content}${newline}${name}: ${value}\n`;
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
  const nextContent = addTopLevelValue(
    addTopLevelValue(
      content,
      "resource_collection_entity_id",
      resourceCollectionEntityId,
    ),
    "permission_group_entity_id",
    permissionGroupEntityId,
  );

  if (nextContent !== content) {
    fs.writeFileSync(manifestPath, nextContent);
  }
}
