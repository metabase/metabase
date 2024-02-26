import type { IconName } from "metabase/core/components/Icon";
import type { UnrestrictedLinkEntity } from "metabase-types/api";

type WrappedEntity = {
  getIcon: () => { name: IconName };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
