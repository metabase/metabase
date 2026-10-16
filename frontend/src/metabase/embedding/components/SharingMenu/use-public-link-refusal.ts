import {
  skipToken,
  useGetCardPublicLinkRefusalQuery,
  useGetDashboardPublicLinkRefusalQuery,
  useGetDocumentPublicLinkRefusalQuery,
} from "metabase/api";
import type {
  CardId,
  DashboardId,
  Document,
  PublicLinkRefusal,
} from "metabase-types/api";

/**
 * What a public link may be created on, in the vocabulary the three refusal endpoints are keyed by.
 */
export type PublicLinkEntity =
  | { model: "card"; id: CardId }
  | { model: "dashboard"; id: DashboardId }
  | { model: "document"; id: Document["id"] };

/**
 * The database that would make a new public link on `entity` return no data, or undefined when a
 * link may be created.
 */
export function usePublicLinkRefusal(
  entity: PublicLinkEntity,
): PublicLinkRefusal["refusing_database"] | undefined {
  // Hooks cannot be called conditionally, so all three are called and the two that do not apply
  // are passed `skipToken`, which issues no request.
  const { data: card } = useGetCardPublicLinkRefusalQuery(
    entity.model === "card" ? entity.id : skipToken,
  );
  const { data: dashboard } = useGetDashboardPublicLinkRefusalQuery(
    entity.model === "dashboard" ? entity.id : skipToken,
  );
  const { data: doc } = useGetDocumentPublicLinkRefusalQuery(
    entity.model === "document" ? entity.id : skipToken,
  );

  return (card ?? dashboard ?? doc)?.refusing_database ?? undefined;
}
