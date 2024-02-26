import type { IconName } from "metabase/core/components/Icon";
import { UnrestrictedLinkEntity } from "metabase-types/api";

type WrappedEntity = {
  getIcon: () => { name: IconName };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
