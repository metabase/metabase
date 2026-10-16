import type { DatabaseId } from "./database";

/**
 * Whether a new public link on one question, dashboard or document would be refused, and by which
 * database.
 */
export interface PublicLinkRefusal {
  refusing_database: {
    id: DatabaseId;
    name: string;
  } | null;
}
