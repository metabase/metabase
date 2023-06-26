import { UnrestrictedLinkEntity } from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";

type WrappedEntity = {
  getIcon: () => { name: IconName };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
