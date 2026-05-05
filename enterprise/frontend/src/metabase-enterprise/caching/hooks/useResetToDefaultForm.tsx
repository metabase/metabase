import { useCallback, useEffect, useState } from "react";

import { useDeleteCacheConfigsMutation } from "metabase/api";

export const useResetToDefaultForm = ({
  databaseIds,
  isFormVisible,
}: {
  databaseIds: number[];
  isFormVisible: boolean;
}) => {
  const [versionNumber, setVersionNumber] = useState(0);
  const [deleteCacheConfigs] = useDeleteCacheConfigsMutation();

  useEffect(() => {
    // Avoid stale context in the form
    if (!isFormVisible) {
      setVersionNumber((n) => n + 1);
    }
  }, [isFormVisible]);

  const handleSubmit = useCallback(async () => {
    if (databaseIds.length === 0) {
      return;
    }
    await deleteCacheConfigs({
      model: "database",
      model_id: databaseIds,
    }).unwrap();
  }, [databaseIds, deleteCacheConfigs]);

  return { handleSubmit, versionNumber };
};
