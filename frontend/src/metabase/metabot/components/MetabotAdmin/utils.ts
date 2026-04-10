import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { FormikErrors } from "formik";
import { P, isMatching } from "ts-pattern";

import { getLocation } from "metabase/selectors/routing";
import { useSelector } from "metabase/utils/redux";
import type { MetabotProvider } from "metabase-types/api";

type ApiKeylessProviders = "metabase";
type ApiKeyProviders = Exclude<MetabotProvider, ApiKeylessProviders>;

type MetabotApiKeylessProviderOption = {
  value: ApiKeylessProviders;
  label: string;
};

type MetabotApiKeyProviderOption = {
  value: ApiKeyProviders;
  label: string;
  apiKey: {
    placeholder: string;
    addKeyUrl: string;
  };
};

export type MetabotProviderOption =
  | MetabotApiKeylessProviderOption
  | MetabotApiKeyProviderOption;

export function getProviderOptions(
  hasMetabaseProviderAccess: boolean,
): Partial<Record<ApiKeylessProviders, MetabotApiKeylessProviderOption>> &
  Record<ApiKeyProviders, MetabotApiKeyProviderOption> {
  return {
    ...(hasMetabaseProviderAccess && {
      metabase: {
        value: "metabase" as const,
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- This is used in admin settings
        label: "Metabase",
      },
    }),
    anthropic: {
      value: "anthropic",
      label: "Anthropic",
      apiKey: {
        placeholder: "sk-ant-api03-...",
        addKeyUrl: "https://console.anthropic.com/settings/keys",
      },
    },
    openai: {
      value: "openai",
      label: "OpenAI",
      apiKey: {
        placeholder: "sk-proj-...",
        addKeyUrl: "https://platform.openai.com/api-keys",
      },
    },
    openrouter: {
      value: "openrouter",
      label: "OpenRouter",
      apiKey: {
        placeholder: "sk-or-v1-...",
        addKeyUrl: "https://openrouter.ai/keys",
      },
    },
  };
}

export type MetabotApiKeyProvider = Exclude<
  MetabotProvider,
  ApiKeylessProviders
>;

export function isMetabotProvider(
  value: string | null | undefined,
): value is MetabotProvider {
  return !!value && value in getProviderOptions(true);
}

export function isApiKeyMetabotProvider(
  provider: MetabotProvider,
): provider is MetabotApiKeyProvider {
  return "apiKey" in (getProviderOptions(true)[provider] ?? {});
}

export function isAvailableProvider(provider: MetabotProvider): boolean {
  return provider === "anthropic" || provider === "metabase";
}

export const API_KEY_SETTING_BY_PROVIDER: Record<
  MetabotApiKeyProvider,
  "llm-anthropic-api-key" | "llm-openai-api-key" | "llm-openrouter-api-key"
> = {
  anthropic: "llm-anthropic-api-key",
  openai: "llm-openai-api-key",
  openrouter: "llm-openrouter-api-key",
};

export function parseProviderAndModel(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const [provider, model] = value.split(/\/(.+)/, 2);
  if (!isMetabotProvider(provider) || !model) {
    return undefined;
  }

  return { provider, model };
}

export function useMetabotIdPath() {
  const location = useSelector(getLocation);
  const metabotId = Number(location?.pathname?.split("/").pop());
  return Number.isNaN(metabotId) ? null : metabotId;
}

// https://redux-toolkit.js.org/rtk-query/usage/error-handling
// https://redux-toolkit.js.org/rtk-query/usage-with-typescript#type-safe-error-handling
export const isFetchBaseQueryError = (
  error: unknown,
): error is FetchBaseQueryError =>
  isMatching({ status: P.any, data: P.any }, error);

type IFieldError<Values> =
  | string
  | { message: string }
  | { errors: FormikErrors<Values> };

const isFieldError = <Values>(error: unknown): error is IFieldError<Values> =>
  isMatching(
    P.union(
      P.string,
      { message: P.string },
      { errors: P.record(P.string, P.any) },
    ),
    error,
  );

// If `error` is a form field error, throw a structured exception with the shape
// `{data: {errors: FormikErrors}}` that will be caught as a validation error by
// [[FormProvider]] in `frontend/src/metabase/forms/components/FormProvider/`.
export const handleFieldError = <Values>(
  error: unknown,
  defaultField: keyof Values,
) => {
  if (!isFieldError<Values>(error)) {
    return;
  }

  if (typeof error === "string") {
    throw { data: { errors: { [defaultField]: error } } };
  }

  if ("message" in error) {
    throw { data: { errors: { [defaultField]: error.message } } };
  }

  if ("errors" in error) {
    throw { data: error };
  }
};
