import {
  skipToken,
  useGetUserQuery,
  useListUserRecipientsQuery,
  useListUsersQuery,
  userApi,
} from "metabase/api";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { UserSchema } from "metabase/schema";

const getUserList = (query = {}, dispatch) =>
  entityCompatibleQuery(query, dispatch, userApi.endpoints.listUsers);
const getRecipientsList = (query = {}, dispatch) =>
  entityCompatibleQuery(query, dispatch, userApi.endpoints.listUserRecipients);

/**
 * @deprecated use "metabase/api" instead
 */
const Users = createEntity({
  name: "users",
  nameOne: "user",
  schema: UserSchema,

  path: "/api/user",

  rtk: {
    getUseGetQuery: () => ({
      useGetQuery,
    }),
    useListQuery,
  },

  api: {
    list: ({ recipients = false, ...args }, dispatch) =>
      recipients
        ? getRecipientsList({}, dispatch)
        : getUserList(args, dispatch),
    create: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        userApi.endpoints.createUser,
      ),
    get: (entityQuery, options, dispatch) =>
      entityCompatibleQuery(
        entityQuery.id,
        dispatch,
        userApi.endpoints.getUser,
      ),
    update: (entityQuery, dispatch) =>
      entityCompatibleQuery(
        entityQuery,
        dispatch,
        userApi.endpoints.updateUser,
      ),
    delete: () => {
      throw new TypeError("Users.api.delete is not supported");
    },
  },

  objectSelectors: {
    getName: (user) => user.common_name,
  },

  actionDecorators: {
    update: (thunkCreator) => (user) => async (dispatch, getState) => {
      const result = await thunkCreator(user)(dispatch, getState);
      return result;
    },
  },
});

const useGetQuery = ({ id }, options) => {
  return useGetUserQuery(id, options);
};

function useListQuery({ recipients = false, ...args } = {}, options) {
  const usersList = useListUsersQuery(recipients ? skipToken : args, options);

  const recipientsList = useListUserRecipientsQuery(
    recipients ? args : skipToken,
    options,
  );

  return recipients ? recipientsList : usersList;
}

export default Users;
