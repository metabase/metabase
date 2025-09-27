export const METABSE_PROTOCOL_LINK =
  /metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)/;

export const METABSE_PROTOCOL_MD_LINK =
  /\[(?<name>[^\]]+)\]\(metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)\)/;

export type MetabaseProtocolEntityModel = "dataset" | "database" | "table";

export interface MetabaseProtocolEntity {
  model: MetabaseProtocolEntityModel;
  id: number;
  name: string;
}

// TOOD: make use of this in parsing function... avoid parsing models we don't know
export const isMetabaseProtocolEntityModel = (
  model: string,
): model is MetabaseProtocolEntityModel => {
  return model === "dataset" || model === "database" || model === "table";
};

export const parseMetabaseProtocolLink = (
  href: string,
): Pick<MetabaseProtocolEntity, "id" | "model"> | undefined => {
  const match = href.match(METABSE_PROTOCOL_LINK);
  return match?.groups as unknown as
    | Pick<MetabaseProtocolEntity, "id" | "model">
    | undefined;
};

export const parseMetabaseProtocolMarkdownLink = (
  href: string,
): MetabaseProtocolEntity | undefined => {
  const match = href.match(METABSE_PROTOCOL_MD_LINK);
  return match?.groups as unknown as MetabaseProtocolEntity | undefined;
};
