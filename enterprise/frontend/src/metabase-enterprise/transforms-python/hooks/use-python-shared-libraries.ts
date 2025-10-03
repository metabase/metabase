import { useCallback } from "react";

import { useLazyGetPythonLibraryQuery } from "metabase-enterprise/api/python-transform-library";

import { SHARED_LIB_IMPORT_PATH } from "../constants";
import type { PythonLibraries } from "../services/pyodide-worker-pool";

export function usePythonLibraries() {
  const [fetchLibrary, { isLoading }] = useLazyGetPythonLibraryQuery();

  const fetchLibraries = useCallback(async (): Promise<PythonLibraries> => {
    try {
      const sharedLib = await fetchLibrary({
        path: SHARED_LIB_IMPORT_PATH,
      }).unwrap();

      return {
        [SHARED_LIB_IMPORT_PATH]: sharedLib?.source ?? "",
      };
    } catch (error) {
      // TODO: handle error better?
      return {
        [SHARED_LIB_IMPORT_PATH]: "",
      };
    }
  }, [fetchLibrary]);

  return { fetchLibraries, isRunning: isLoading };
}
