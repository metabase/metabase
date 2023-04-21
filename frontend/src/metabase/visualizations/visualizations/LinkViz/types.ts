import { UnrestrictedLinkEntity } from "metabase-types/api";

type WrappedEntity = {
  getIcon: () => { name: string };
  getUrl: () => string;
};

export type WrappedUnrestrictedLinkEntity = UnrestrictedLinkEntity &
  WrappedEntity;
