export type MetabaseProviderStoreInitializationStatus =
  | "uninitialized"
  | "initialized";

export type MetabaseProviderStoreInitializationEvent = {
  status: MetabaseProviderStoreInitializationStatus;
};
