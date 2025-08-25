import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
  union,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { ComponentProviderProps } from "./ComponentProvider";

const rawPropsSchema = strictObject({
  allowConsoleLog: optional(any()),
  authConfig: nonoptional(
    union([
      strictObject({
        metabaseInstanceUrl: nonoptional(any()),
        apiKey: nonoptional(any()),
      }),
      strictObject({
        metabaseInstanceUrl: nonoptional(any()),
        preferredAuthMethod: optional(any()),
        fetchRequestToken: optional(any()),
      }),
      strictObject({
        metabaseInstanceUrl: nonoptional(any()),
        preferredAuthMethod: optional(any()),
      }),
    ]),
  ),
  children: optional(any()),
  className: optional(any()),
  errorComponent: optional(any()),
  eventHandlers: optional(
    strictObject({
      onDashboardLoad: optional(any()),
      onDashboardLoadWithoutCards: optional(any()),
    }),
  ),
  loaderComponent: optional(any()),
  locale: optional(any()),
  pluginsConfig: optional(
    strictObject({
      mapQuestionClickActions: optional(any()),
      dashboard: optional(any()),
    }),
  ),
  reduxStore: any(),
  theme: optional(
    strictObject({
      fontSize: optional(any()),
      fontFamily: optional(any()),
      lineHeight: optional(any()),
      colors: optional(any()),
      components: optional(any()),
    }),
  ),
});
const propsSchema: ValidateInferredSchema<
  ComponentProviderProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const componentProviderSchema = functionSchema({
  input: [propsSchema],
});
