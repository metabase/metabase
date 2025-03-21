import type { SdkEntityId } from "./entity-id";

// "CollectionId" from core app also includes "root" | "users" and "trash", we don't want to include those
// in public apis of the sdk, as we don't support them

export type SdkCollectionId = number | "personal" | "root" | SdkEntityId;
