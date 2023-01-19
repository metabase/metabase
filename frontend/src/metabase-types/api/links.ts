export type EntityLinkType = "dashboard" | "question" | "model" | "collection";
export type LinkType = "external_link" | EntityLinkType;

interface LinkBase {
  id: number;
  name: string;
  description: string | null;
}

export interface EntityLink extends LinkBase {
  type: EntityLinkType;
  entity_id: number;
}

export interface ExternalLink extends LinkBase {
  type: "external_link";
  url: string;
}

export type Link = EntityLink | ExternalLink;

export type NewEntityLink = Omit<EntityLink, "id">;
export type NewExternalLink = Omit<ExternalLink, "id">;

export type NewLink = NewEntityLink | NewExternalLink;
