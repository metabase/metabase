import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

export function getAddableProviderTypes(
  providerTypes: LlmProviderType[],
  connections: LlmProviderConnection[],
) {
  return providerTypes.filter(
    (providerType) =>
      !providerType.singleton ||
      !connections.some((connection) => connection.type === providerType.type),
  );
}
