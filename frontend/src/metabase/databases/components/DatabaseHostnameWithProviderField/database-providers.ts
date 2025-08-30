import type {
  DatabaseProvider,
  DatabaseProviderName,
} from "metabase-types/api/settings";

export const detectDBProvider = (
  host: string,
  patterns: DatabaseProvider[] | undefined,
): DatabaseProviderName | null => {
  if (!host || !patterns) {
    return null;
  }
  const provider = patterns?.find(({ pattern }) =>
    new RegExp(pattern).test(host),
  );

  return (provider?.name as DatabaseProviderName) || null;
};
