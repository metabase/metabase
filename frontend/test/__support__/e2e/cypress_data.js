export const USER_GROUPS = {
  ALL_USERS_GROUP: 1,
  ADMIN_GROUP: 2,
  COLLECTION_GROUP: 4,
  DATA_GROUP: 5,
  READONLY_GROUP: 6,
  NOSQL_GROUP: 7,
};

const {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  DATA_GROUP,
  READONLY_GROUP,
  NOSQL_GROUP,
} = USER_GROUPS;

export const USERS = {
  // All around access
  admin: {
    first_name: "Bobby",
    last_name: "Tables",
    email: "admin@metabase.test",
    password: "12341234",
  },
  normal: {
    first_name: "Robert",
    last_name: "Tableton",
    email: "normal@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP],
  },
  // Collection-related users that don't have access to data at all
  nodata: {
    first_name: "No Data",
    last_name: "Tableton",
    email: "nodata@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP],
  },
  sandboxed: {
    first_name: "User",
    last_name: "1",
    email: "u1@metabase.test",
    password: "12341234",
    login_attributes: {
      attr_uid: "1",
      attr_cat: "Widget",
    },
    group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP],
  },
  readonly: {
    first_name: "Read Only",
    last_name: "Tableton",
    email: "readonly@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, READONLY_GROUP],
  },
  // Users with access to data, but no access to collections
  nocollection: {
    first_name: "No Collection",
    last_name: "Tableton",
    email: "nocollection@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, DATA_GROUP],
  },
  nosql: {
    first_name: "No SQL",
    last_name: "Tableton",
    email: "nosql@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, NOSQL_GROUP],
  },
  // No access at all
  none: {
    first_name: "None",
    last_name: "Tableton",
    email: "none@metabase.test",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP],
  },
};
