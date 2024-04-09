import type {
  LinkEntity,
  RestrictedLinkEntity,
} from "metabase-types/api/dashboard";

export const isRestrictedLinkEntity = (
  value: LinkEntity,
): value is RestrictedLinkEntity =>
  !!(value as RestrictedLinkEntity)?.restricted;
