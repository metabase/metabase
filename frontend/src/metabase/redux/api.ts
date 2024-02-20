import { createApi } from "@reduxjs/toolkit/query/react";

import type {
  ApiKey,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyOutput,
  RegenerateApiKeyResponse,
} from "metabase-types/api/admin";

import { createEntityApi, getListTag } from "metabase/redux/utils";
import {
  createEntityApi,
  getListTag,
  providesList,
} from "metabase/redux/utils";

const API_KEY_LIST_TAG = getListTag("apiKey");

// Approach #1
//
// While it's the most verbose approach, it's my prefernce given it's quite a declaritive api
// Having to implement these manually for each entity/entity-ish api resource is kind of a pain
// but I think with thinks like copilot this should fill in for developers quite quickly.
// Doing anything magical doesn't go very far imo when you look at files in the entity folder
// where everything ends up with a fairly custom implemntation in the end

export const ApiKeysApi = createApi({
  reducerPath: "apiKeys",
  tagTypes: ["apiKey"],
  baseQuery: apiQuery,
  endpoints: builder => ({
    list: builder.query<Entity[], void>({
      query: () => `/api/api-key`,
      providesTags: result => providesList(result, "apiKey"),
    }),
    count: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    create: builder.mutation<CreateOutput, CreateInput>({
      query: input => ({
        method: "POST",
        url: `/api/api-key`,
        body: input,
      }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    update: builder.mutation<UpdateOutput, UpdateInput>({
      query: ({ id, ...body }) => ({
        method: "PUT",
        url: `/api/api-key/${id}`,
        body,
      }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    delete: builder.mutation<void, Entity["id"]>({
      query: id => ({ method: "DELETE", url: `/api/api-key/${id}` }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
    regenerate: builder.mutation<RegenerateApiKeyResponse, ApiKey["id"]>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [API_KEY_LIST_TAG],
    }),
  }),
});

// Approach #2
//
// Have method that constructs the rtkquery api instance for use and adds
// get / list / create / update / delete method automatically
// You can extend the api using `injectEndpoints` provided by RTKQuery
// to add endpoints specific to this entity and you have the
// `enhanceEndpoints` method if you want to modify the existing endpoints
// (https://redux-toolkit.js.org/rtk-query/api/created-api/code-splitting#enhanceendpoints)

export const ApiKeysApiApproachTwo = createEntityApi<
  ApiKey,
  "ApiKey",
  CreateApiKeyInput,
  CreateApiKeyResponse,
  UpdateApiKeyInput,
  UpdateApiKeyOutput
>({
  entityName: "ApiKey",
  apiPath: "api-key",
}).injectEndpoints({
  endpoints: builder => ({
    count: builder.query<number, void>({
      query: () => `/api/api-key/count`,
    }),
    regenerate: builder.mutation<RegenerateApiKeyResponse, ApiKey["id"]>({
      query: id => ({ method: "PUT", url: `/api/api-key/${id}/regenerate` }),
      invalidatesTags: [getListTag("ApiKey")],
    }),
  }),
});

// Approach #3
//
// Custom module approach -- this is how the RTKQuery hooks feature is implimented
// https://redux-toolkit.js.org/rtk-query/usage/customizing-create-api#creating-your-own-module
//
// I wonder if we could pull of something like this using this tool?
//
//  export const SomeEntityApi = createEntityApi({
//    reducerPath: "entityName",
//    tagTypes: ["entityName"],
//    baseQuery: apiQuery,
//    endpoints: (builder, entity) => ({
//      list: entity.list<YourEntityType>()
//      get: entity.get<YourEntityType>()
//      update: entity.update<{ id: number; name: string }, boolean>()
//      ...
//    })
//  })
//
//  If not, I think we could do something like this
//
//  export const SomeEntityApi = createEntityApi({
//    reducerPath: "entityName",
//    tagTypes: ["entityName"],
//    baseQuery: apiQuery,
//    entityMethods: ["list", "get", "update", "delete"],
//    endpoints: (builder) => ({
//      update: {
//        create: builder.mutation....
//      }
//    })
//  })
