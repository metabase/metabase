import type { Transform, TransformSourceConnector } from "metabase-types/api";

export function getTransformConnector(
  transform: Transform,
): TransformSourceConnector | null {
  return transform.source.type === "python"
    ? (transform.source.connector ?? null)
    : null;
}

export type ConnectionGroup = {
  connectionId: string;
  connectorId: string;
  config: Record<string, string>;
  transforms: Transform[];
};

export function groupConnections(transforms: Transform[]): ConnectionGroup[] {
  const groups = new Map<string, ConnectionGroup>();
  for (const transform of transforms) {
    const meta = getTransformConnector(transform);
    if (meta == null) {
      continue;
    }
    const group = groups.get(meta["connection-id"]);
    if (group != null) {
      group.transforms.push(transform);
    } else {
      groups.set(meta["connection-id"], {
        connectionId: meta["connection-id"],
        connectorId: meta.id,
        config: meta.config,
        transforms: [transform],
      });
    }
  }
  return [...groups.values()];
}
