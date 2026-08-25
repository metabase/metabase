import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-base-api-access";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
    sourceType: "module",
  },
});

const COMPONENT_FILE = "/repo/frontend/src/metabase/foo/components/Foo.tsx";
const OWNER_FILE = "/repo/frontend/src/metabase/foo/api/bar.ts";
const OWNER_SINGLE_FILE = "/repo/frontend/src/metabase/foo/api.ts";
const SUPPORT_FILE = "/repo/frontend/test/__support__/api.ts";
const SPEC_FILE = "/repo/frontend/src/metabase/foo/Foo.unit.spec.tsx";
const API_MODULE_FILE = "/repo/frontend/src/metabase/api/card.ts";

const options = [
  {
    allowInjectionIn: [
      "/repo/frontend/src/metabase/api/**",
      "**/api/**",
      "**/api.ts",
    ],
    allowReachIn: [
      "/repo/frontend/src/metabase/api/**",
      "/repo/frontend/test/**",
      "**/__support__/**",
      "**/*.unit.spec.*",
    ],
  },
];

const VALID_CASES = [
  {
    name: "hook exported by the owner",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { useGetCardQuery } from "metabase/api";
      export function Foo({ id }) {
        const { data } = useGetCardQuery(id);
        return data?.name ?? null;
      }
    `,
  },
  {
    name: "endpoint reached through the owner's api slice",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { cardApi } from "metabase/api";
      export const selectCard = (state, id) =>
        cardApi.endpoints.getCard.select(id)(state);
    `,
  },
  {
    name: "tag invalidation through the base object",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const refresh = () => (dispatch) =>
        dispatch(Api.util.invalidateTags([{ type: "bookmark", id: "LIST" }]));
    `,
  },
  {
    name: "resetting the cache through the base object",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const logout = () => (dispatch) => dispatch(Api.util.resetApiState());
    `,
  },
  {
    name: "store wiring through the base object",
    filename: "/repo/frontend/src/metabase/redux/store.ts",
    options,
    code: `
      import { Api } from "metabase/api";
      export const reducers = { [Api.reducerPath]: Api.reducer };
      export const middleware = [Api.middleware];
    `,
  },
  {
    name: "injection inside an owner file under api/",
    filename: OWNER_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const barApi = Api.injectEndpoints({ endpoints: () => ({}) });
    `,
  },
  {
    name: "injection inside a module's api.ts",
    filename: OWNER_SINGLE_FILE,
    options,
    code: `
      import { Api } from "metabase/api/api";
      export const fooApi = Api.injectEndpoints({ endpoints: () => ({}) });
    `,
  },
  {
    name: "enterprise tag types added by the enterprise api file",
    filename: "/repo/enterprise/frontend/src/metabase-enterprise/api/api.ts",
    options,
    code: `
      import { Api } from "metabase/api";
      export const EnterpriseApi = Api.enhanceEndpoints({ addTagTypes: ["x"] });
    `,
  },
  {
    name: "cache seeding in test support",
    filename: SUPPORT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const seed = (state, entries) =>
        Api.reducer(state, Api.util.upsertQueryEntries(entries));
    `,
  },
  {
    name: "endpoint access in a spec",
    filename: SPEC_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      const select = Api.endpoints.getSessionProperties.select();
    `,
  },
  {
    name: "endpoint access inside the api module",
    filename: API_MODULE_FILE,
    options,
    code: `
      import { Api } from "./api";
      import { Api as BaseApi } from "metabase/api/api";
      export const x = BaseApi.endpoints;
    `,
  },
  {
    name: "another module's Api binding",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/lib/api";
      export const load = () => Api.endpoints.get();
    `,
  },
  {
    name: "shadowed name is not the import",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export function build(Api) {
        return Api.endpoints.getCard;
      }
    `,
  },
];

const INVALID_CASES = [
  {
    name: "endpoint selected by name in a component",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const selectProps = Api.endpoints.getSessionProperties.select();
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "endpoint initiated by name in an action",
    filename: "/repo/frontend/src/metabase/foo/actions.ts",
    options,
    code: `
      import { Api } from "metabase/api/api";
      export const load = (id) => (dispatch) =>
        dispatch(Api.endpoints.getCard.initiate(id));
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "cache seeding outside test support",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const seed = (entries) => Api.util.upsertQueryEntries(entries);
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "prefetch by name",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const warm = () => (dispatch) => dispatch(Api.util.prefetch("getCard", 1));
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "running queries thunk",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const wait = () => (dispatch) => dispatch(Api.util.getRunningQueriesThunk());
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "invalidated entries selected by name",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const stale = (state) => Api.util.selectInvalidatedBy(state, ["card"]);
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "util object handed on whole",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const util = Api.util;
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "endpoints destructured",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      const { endpoints } = Api;
      export const getCard = endpoints.getCard;
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "injection in a component",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const fooApi = Api.injectEndpoints({ endpoints: () => ({}) });
    `,
    errors: [{ messageId: "injection" }],
  },
  {
    name: "enhancement outside the enterprise api file",
    filename: "/repo/enterprise/frontend/src/metabase-enterprise/foo/Foo.tsx",
    options,
    code: `
      import { EnterpriseApi } from "metabase-enterprise/api";
      export const x = EnterpriseApi.enhanceEndpoints({ addTagTypes: ["y"] });
    `,
    errors: [{ messageId: "injection" }],
  },
  {
    name: "enterprise endpoint by name",
    filename: "/repo/enterprise/frontend/src/metabase-enterprise/foo/Foo.tsx",
    options,
    code: `
      import { EnterpriseApi } from "metabase-enterprise/api/api";
      export const x = EnterpriseApi.endpoints.getGsheetsStatus.select();
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "renamed base import",
    filename: COMPONENT_FILE,
    options,
    code: `
      import { Api as BaseApi } from "metabase/api";
      export const x = BaseApi.endpoints.getCard;
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "cache seeding in a product file named api.ts",
    filename: "/repo/frontend/src/metabase/redux/store/mocks/api.ts",
    options,
    code: `
      import { Api } from "metabase/api";
      export const seed = (state, entries) =>
        Api.reducer(state, Api.util.upsertQueryEntries(entries));
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "endpoint reached by name in an owner file",
    filename: OWNER_FILE,
    options,
    code: `
      import { Api } from "metabase/api";
      export const selectFoo = Api.endpoints.getFoo.select();
    `,
    errors: [{ messageId: "endpointAccess" }],
  },
  {
    name: "no allowlists means everywhere is checked",
    filename: OWNER_FILE,
    code: `
      import { Api } from "metabase/api";
      export const barApi = Api.injectEndpoints({ endpoints: () => ({}) });
    `,
    errors: [{ messageId: "injection" }],
  },
];

ruleTester.run("no-base-api-access", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES,
});
