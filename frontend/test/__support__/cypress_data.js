export const USER_GROUPS = {
  ALL_USERS_GROUP: 1,
  ADMIN_GROUP: 2,
  COLLECTION_GROUP: 4,
  DATA_GROUP: 5,
};

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

export const USERS = {
  admin: {
    first_name: "Bobby",
    last_name: "Tables",
    email: "admin@metabase.com",
    password: "12341234",
  },
  normal: {
    first_name: "Robert",
    last_name: "Tableton",
    email: "normal@metabase.com",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP],
  },
  nodata: {
    first_name: "No Data",
    last_name: "Tableton",
    email: "nodata@metabase.com",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, COLLECTION_GROUP],
  },
  nocollection: {
    first_name: "No Collection",
    last_name: "Tableton",
    email: "nocollection@metabase.com",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP, DATA_GROUP],
  },
  none: {
    first_name: "None",
    last_name: "Tableton",
    email: "none@metabase.com",
    password: "12341234",
    group_ids: [ALL_USERS_GROUP],
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
};
