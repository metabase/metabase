export const REGULAR_COLLECTION = {
  type: null,
  name: "Regular",
  icon: "folder",
};

export const OFFICIAL_COLLECTION = {
  type: "official",
  name: "Official",
  icon: "badge",
  color: "saturated-yellow",
};

export const AUTHORITY_LEVELS = {
  [OFFICIAL_COLLECTION.type]: OFFICIAL_COLLECTION,
  [REGULAR_COLLECTION.type]: REGULAR_COLLECTION,
  regular: REGULAR_COLLECTION, // just an alias
};
