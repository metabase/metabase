export const METABSE_PROTOCOL_LINK =
  /metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)/;

export const METABSE_PROTOCOL_MD_LINK =
  /\[(?<name>[^\]]+)\]\(metabase:\/\/(?<model>[^\/]+)\/(?<id>\d+)\)/;

export type MetabaseProtocolEntityModel = "dataset" | "database" | "table";

// TODO: parse don't validate?
// TODO: only parse models that are known
// TODO: fix models/dataset issue
// TODO: add all possible entities

export interface MetabaseProtocolEntity {
  model: MetabaseProtocolEntityModel;
  id: number;
  name: string;
}

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
