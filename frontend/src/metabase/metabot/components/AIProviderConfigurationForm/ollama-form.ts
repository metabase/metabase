import type {
  LlmProviderConfig,
  LlmProviderField,
  LlmProviderType,
} from "metabase-types/api";

import { isVisibleField } from "./visible-fields";

// Ollama's two deployments need opposite credentials: a self-hosted server has an address only the
// admin knows and usually no key, Ollama Cloud has a fixed address and a key that is the whole
// credential. The registry gets the *visibility* of those fields right — `base-url` is shown only
// for a self-hosted server — but not their requiredness: `required_any` is satisfied by whichever
// credential is present, whatever `hosting` says, so the form would offer to connect a self-hosted
// server with nothing but a key and then fail on save. This module overrides that one flag, and
// leaves everything else to the registry.

const OLLAMA_TYPE = "ollama";
const OLLAMA_CLOUD = "cloud";

const HOSTING_FIELD = "hosting";
const BASE_URL_FIELD = "base-url";
const API_KEY_FIELD = "api-key";

export function isOllamaProvider(providerType: LlmProviderType) {
  return providerType.type === OLLAMA_TYPE;
}

/**
 * The registry's fields for the chosen deployment, with that deployment's credential marked
 * required — which the registry leaves optional, because either one can be the right answer.
 */
export function getOllamaFields(
  providerType: LlmProviderType,
  config: LlmProviderConfig,
): LlmProviderField[] {
  // Cloud's address is fixed, so its key is the whole credential; a self-hosted server needs an
  // address, and a key only if it sits behind a proxy that wants one.
  const requiredKey =
    config[HOSTING_FIELD] === OLLAMA_CLOUD ? API_KEY_FIELD : BASE_URL_FIELD;

  return providerType.fields
    .filter((field) => isVisibleField(field, providerType.fields, config))
    .map((field) =>
      field.key === requiredKey ? { ...field, required: true } : field,
    );
}
