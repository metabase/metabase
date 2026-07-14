export const METABSE_PROTOCOL_LINK =
  /metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)/;

export const METABSE_PROTOCOL_MD_LINK =
  /\[(?<name>[^\]]+)\]\(metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)\)/;

const METABASE_PROTOCOL_CHART_LINK =
  /metabase:\/\/chart\/(?<id>[A-Za-z0-9_-]+)/;

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
  // Unjustified type cast. FIXME
  return (METABASE_PROTOCOL_ENTITY_MODELS as readonly string[]).includes(model);
};

export interface MetabaseProtocolEntity {
  id: number;
  model: MetabaseProtocolEntityModel;
  name: string;
}

export type ParsedMetabaseProtocolLink =
  | Pick<MetabaseProtocolEntity, "id" | "model">
  | { id: string; model: "chart" };

export const parseMetabaseProtocolLink = (
  href: string,
): ParsedMetabaseProtocolLink | undefined => {
  const chartId = href.match(METABASE_PROTOCOL_CHART_LINK)?.groups?.id;
  if (chartId) {
    return { id: chartId, model: "chart" };
  }

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
}: ParsedMetabaseProtocolLink & { name: string }): string => {
  return `[${name}](metabase://${model}/${id})`;
};
