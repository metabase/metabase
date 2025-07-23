export type MetabaseProviderPropsStoreInitState =
  | "uninitialized"
  | "initialized";

export type MetabaseProviderPropsStoreInitEvent = {
  status: MetabaseProviderPropsStoreInitState;
};
