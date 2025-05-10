import type { Engine } from "metabase-types/api";

import { CONNECTION_STRING_CONFIG } from "../constants";

// provider://user:pass@host:port/database?options
const CS_PATTERN =
  /^(?:([^:]+):\/\/)?(?:([^:]+)(?::([^@]+))?@)?([^:/]+)(?::(\d+))?(?:\/([^?]*))?(?:\?(.*))?$/;

export interface ParsedConnectionResult {
  isValid: boolean;
  engineKey?: string;
  fieldValues: Record<string, string | boolean | number | null>;
  error?: string;
}

const getEngineFromProviderInternal = (
  provider: string | undefined,
  engines: Record<string, Engine>,
): string | undefined => {
  if (!provider) {
    return undefined;
  }
  const normalizedProvider = provider.toLowerCase();
  if (engines[normalizedProvider]) {
    return normalizedProvider;
  }
  if (CONNECTION_STRING_CONFIG.providerMap[normalizedProvider]) {
    const mappedEngine =
      CONNECTION_STRING_CONFIG.providerMap[normalizedProvider];
    if (engines[mappedEngine]) {
      return mappedEngine;
    }
  }
  const engineEntry = Object.entries(engines).find(
    ([, engine]) => engine["driver-name"]?.toLowerCase() === normalizedProvider,
  );
  return engineEntry?.[0];
};

/**
 * Parses a JDBC-style connection string and maps its components to field paths.
 * @param connectionString The raw connection string.
 * @param engines The map of available Metabase engines.
 * @param currentEngine The currently selected engine (used to determine field types).
 * @returns A ParsedConnectionResult object.
 */
export const parseConnectionString = (
  connectionString: string,
  engines: Record<string, Engine>,
  currentEngine: Engine | undefined,
): ParsedConnectionResult => {
  const result: ParsedConnectionResult = {
    isValid: false,
    fieldValues: {},
  };

  if (!connectionString.includes("://") && !connectionString.includes("@")) {
    return result;
  }
  try {
    const match = connectionString.match(CS_PATTERN);

    if (!match) {
      return result;
    }
    result.isValid = true;
    const [, provider, user, password, host, port, database, queryString] =
      match;
    const rawParts: Record<string, string | undefined> = {
      provider,
      user,
      password,
      host,
      port,
      database,
    };

    result.engineKey = getEngineFromProviderInternal(provider, engines);

    // Map main parts (host, port, user, etc.)
    Object.entries(rawParts).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      const targetPaths = CONNECTION_STRING_CONFIG.paramMap[key];
      if (!targetPaths) {
        return;
      }

      if (Array.isArray(targetPaths)) {
        targetPaths.forEach((path) => {
          result.fieldValues[path] = value;
        });
      } else {
        result.fieldValues[targetPaths] = value;
      }
    });

    // Set default port if not specified nor filled in
    const PORT_TARGET_PATH = CONNECTION_STRING_CONFIG.paramMap[
      "port"
    ] as string;
    if (
      !port &&
      currentEngine?.["details-fields"] &&
      !result.fieldValues[PORT_TARGET_PATH]
    ) {
      const portField = currentEngine["details-fields"].find(
        (field) => field.name === "port",
      );
      const defaultPort = portField?.placeholder;
      if (typeof defaultPort === "number" || typeof defaultPort === "string") {
        result.fieldValues[PORT_TARGET_PATH] = defaultPort;
      }
    }

    // Query string options to map SSL mode and push the rest as additional options
    let additionalOptionsString: string | undefined = undefined;

    if (queryString) {
      const params = new URLSearchParams(queryString);
      additionalOptionsString = queryString;
      if (params.has("sslmode")) {
        const sslmodeValue = params.get("sslmode") ?? "";
        result.fieldValues["details.ssl"] = true;
        result.fieldValues["details.ssl-mode"] = sslmodeValue;

        // Create new params excluding sslmode for additional options
        const additionalParams = new URLSearchParams(queryString);
        additionalParams.delete("sslmode");
        additionalOptionsString = additionalParams.toString();
      }

      const hasAdditionalOptionsField = currentEngine?.["details-fields"]?.some(
        (field) => field.name === "additional-options",
      );
      if (hasAdditionalOptionsField) {
        result.fieldValues["details.additional-options"] =
          additionalOptionsString;
      }
    }
  } catch (error) {
    console.error("Error parsing connection string:", error);
    result.isValid = false;
    result.fieldValues = {};
    result.engineKey = undefined;
    result.error = String(error instanceof Error ? error.message : error);
  }

  return result;
};
