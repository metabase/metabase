import type { UnrestrictedLinkEntity } from "metabase-types/api";
import type { IconName } from "metabase/ui";

type WrappedEntity = {
  getIcon: () => { name: IconName };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
