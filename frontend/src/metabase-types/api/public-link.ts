import type { CardId } from "./card";
import type { DashboardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { DocumentId } from "./document";

export type PublicLinkEntity =
  | { model: "card"; id: CardId }
  | { model: "dashboard"; id: DashboardId }
  | { model: "document"; id: DocumentId };

export interface PublicLinkRefusalResponse {
  refusal: {
    message: string;
    database: {
      id: DatabaseId;
      name: string;
    };
  } | null;
}
