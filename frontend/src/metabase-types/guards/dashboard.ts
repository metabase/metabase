import type {
  LinkEntity,
  RestrictedLinkEntity,
} from "metabase-types/api/dashboard";

export const isRestrictedLinkEntity = (
  value: LinkEntity,
): value is RestrictedLinkEntity =>
  // Unjustified type cast. FIXME
  !!(value as RestrictedLinkEntity)?.restricted;
