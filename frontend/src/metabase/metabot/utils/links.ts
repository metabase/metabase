export const METABSE_PROTOCOL_LINK =
  /metabase:\/\/(?<model>[^\/]+)\/(?<id>[^\/?#)\s]+)/;

export const METABSE_PROTOCOL_MD_LINK =
  /\[(?<name>[^\]]+)\]\(metabase:\/\/(?<model>[^\/]+)\/(?<id>[^\/?#)\s]+)\)/;

export const METABASE_PROTOCOL_ENTITY_MODELS = [
  "question",
  "dashboard",
  "collection",
  "document",
  "model",
  "database",
  "table",
  "transform",
  "data-point",
] as const;

export type MetabaseProtocolEntityModel =
  (typeof METABASE_PROTOCOL_ENTITY_MODELS)[number];

const isMetabaseProtocolEntityModel = (
  model: string,
): model is MetabaseProtocolEntityModel => {
  return (METABASE_PROTOCOL_ENTITY_MODELS as readonly string[]).includes(model);
};

export interface MetabaseProtocolEntity {
  id: number | string;
  model: MetabaseProtocolEntityModel;
  name: string;
}

const parseMetabaseProtocolEntityId = (
  model: MetabaseProtocolEntityModel,
  id: string,
) => {
  if (model === "data-point") {
    return id;
  }

  const numericId = parseInt(id, 10);
  return Number.isNaN(numericId) ? undefined : numericId;
};

export const parseMetabaseProtocolLink = (
  href: string,
): Pick<MetabaseProtocolEntity, "id" | "model"> | undefined => {
  const match = href.match(METABSE_PROTOCOL_LINK);

  if (!match?.groups) {
    return undefined;
  }

  const { id, model } = match.groups;

  if (!isMetabaseProtocolEntityModel(model)) {
    return undefined;
  }

  const entityId = parseMetabaseProtocolEntityId(model, id);
  return entityId == null ? undefined : { id: entityId, model };
};

export const parseMetabaseProtocolMarkdownLink = (
  href: string,
): MetabaseProtocolEntity | undefined => {
  const match = href.match(METABSE_PROTOCOL_MD_LINK);

  if (!match?.groups) {
    return undefined;
  }

  const { id, model, name } = match.groups;

  if (!isMetabaseProtocolEntityModel(model)) {
    return undefined;
  }

  const entityId = parseMetabaseProtocolEntityId(model, id);
  return entityId == null ? undefined : { id: entityId, model, name };
};

export const createMetabaseProtocolLink = ({
  id,
  name,
  model,
}: MetabaseProtocolEntity): string => {
  return `[${name}](metabase://${model}/${id})`;
};
