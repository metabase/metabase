import { createApi, type BaseQueryFn } from "@reduxjs/toolkit/query/react";
import api from "metabase/lib/api";
import { providesList, getListTag } from "./query-cache";

type AllowedHTTPMethods = "GET" | "POST" | "PUT" | "DELETE";
const allowedHTTPMethods = new Set<AllowedHTTPMethods>([
  "GET",
  "POST",
  "PUT",
  "DELETE",
]);
const isAllowedHTTPMethod = (method: any): method is AllowedHTTPMethods => {
  return allowedHTTPMethods.has(method);
};

// custom fetcher that wraps our Api client
export const apiQuery: BaseQueryFn<
  any,
  unknown,
  unknown,
  any, // narrow down type (above are fine / same as rtkquery's fetchBaseQuery)
  any // narrow down type
> = async (args, ctx, extraOptions: any) => {
  const method = typeof args === "string" ? "GET" : args?.method;
  const url = typeof args === "string" ? args : args.url;

  if (!isAllowedHTTPMethod(method)) {
    return { error: "Invalid HTTP method" };
  }

  try {
    const abortControllerOption = ctx.signal
      ? { controller: ctx.signal }
      : undefined;
    const options = Object.assign(
      {},
      abortControllerOption,
      extraOptions?.requestOptions,
    );

    // ????: perf overhead to contrusting the method on each call
    const data = await api[method](url)(args?.body, options);
    return { data };
  } catch (error) {
    return { error };
  }
};

type ID = number | string;
type ParitalWithId<T extends { id: ID }> = Partial<Omit<T, "id">> &
  Pick<T, "id">;

export const createEntityApi = <
  Entity extends { id: ID },
  EntityName extends string,
  CreateInput = Omit<Entity, "id">,
  CreateOutput = boolean,
  UpdateInput extends ParitalWithId<Entity> = ParitalWithId<Entity>,
  UpdateOutput = boolean,
>({
  entityName,
  apiPath,
}: {
  entityName: EntityName;
  apiPath: string;
}) => {
  return createApi({
    reducerPath: entityName,
    tagTypes: [entityName],
    baseQuery: apiQuery,
    endpoints: builder => ({
      get: builder.query<Entity, Entity["id"]>({
        query: id => `/api/${apiPath}/${id}`,
      }),
      list: builder.query<Entity[], void>({
        query: () => `/api/${apiPath}`,
        providesTags: result => providesList(result, entityName),
      }),
      update: builder.mutation<UpdateOutput, UpdateInput>({
        query: ({ id, ...body }) => ({
          method: "PUT",
          url: `/api/${apiPath}/${id}`,
          body,
        }),
        invalidatesTags: [getListTag(entityName)],
      }),
      create: builder.mutation<CreateOutput, CreateInput>({
        query: input => ({
          method: "POST",
          url: `/api/${apiPath}`,
          body: input,
        }),
        invalidatesTags: [getListTag(entityName)],
      }),
      delete: builder.mutation<void, Entity["id"]>({
        query: id => ({
          method: "DELETE",
          url: `/api/${apiPath}/${id}`,
        }),
        invalidatesTags: [getListTag(entityName)],
      }),
    }),
  });
};
