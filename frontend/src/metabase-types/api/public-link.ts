import type { CardId } from "./card";
import type { DashboardId } from "./dashboard";
import type { DatabaseId } from "./database";
import type { DocumentId } from "./document";

/**
 * What a public link may be created on.
 */
export type PublicLinkEntity =
  | { model: "card"; id: CardId }
  | { model: "dashboard"; id: DashboardId }
  | { model: "document"; id: DocumentId };

/**
 * Why a new public link on one question, dashboard or document would be refused, or null when one
 * may be created.
 */
export interface PublicLinkRefusalResponse {
  refusal: {
    message: string;
    database: {
      id: DatabaseId;
      name: string;
    };
  } | null;
}
