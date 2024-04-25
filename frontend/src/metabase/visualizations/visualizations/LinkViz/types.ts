import type { IconName } from "metabase/ui";
import type { UnrestrictedLinkEntity } from "metabase-types/api";

type WrappedEntity = {
  getIcon: () => { name: IconName };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
