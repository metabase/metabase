import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";

import { CacheConfigApi } from "metabase/services";
import type { CacheConfig } from "metabase-types/api";

export const useResetToDefaultForm = ({
  configs,
  setConfigs,
  databaseIds,
  isFormVisible,
}: {
  configs: CacheConfig[];
  setConfigs: Dispatch<SetStateAction<CacheConfig[]>>;
  databaseIds: number[];
  isFormVisible: boolean;
}) => {
  const [versionNumber, setVersionNumber] = useState(0);

  useEffect(() => {
    // Avoid stale context in the form
    if (!isFormVisible) {
      setVersionNumber((n) => n + 1);
    }
  }, [isFormVisible]);

  const handleSubmit = useCallback(async () => {
    const originalConfigs = [...configs];
    if (databaseIds.length === 0) {
      return;
    }
    try {
      await CacheConfigApi.delete(
        { model_id: databaseIds, model: "database" },
        { hasBody: true },
      );
      setConfigs((configs: CacheConfig[]) =>
        configs.filter(({ model }) => model !== "database"),
      );
    } catch (e) {
      setConfigs(originalConfigs);
      throw e;
    }
  }, [configs, setConfigs, databaseIds]);

  return { handleSubmit, versionNumber };
};
