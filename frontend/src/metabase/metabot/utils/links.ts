export const METABSE_PROTOCOL_LINK =
  /metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)/;

export const METABSE_PROTOCOL_MD_LINK =
  /\[(?<name>[^\]]+)\]\(metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)\)/;

export const METABASE_PROTOCOL_ENTITY_MODELS = [
  "question",
  "dashboard",
  "collection",
  "document",
  "model",
  "database",
  "table",
  "transform",
] as const;

export type MetabaseProtocolEntityModel =
  (typeof METABASE_PROTOCOL_ENTITY_MODELS)[number];

const isMetabaseProtocolEntityModel = (
  model: string,
): model is MetabaseProtocolEntityModel => {
  return (METABASE_PROTOCOL_ENTITY_MODELS as readonly string[]).includes(model);
};

export interface MetabaseProtocolEntity {
  id: number;
  model: MetabaseProtocolEntityModel;
  name: string;
}

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

  return { id: parseInt(id, 10), model };
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

  return { id: parseInt(id, 10), model, name };
};

export const createMetabaseProtocolLink = ({
  id,
  name,
  model,
}: MetabaseProtocolEntity): string => {
  return `[${name}](metabase://${model}/${id})`;
};
