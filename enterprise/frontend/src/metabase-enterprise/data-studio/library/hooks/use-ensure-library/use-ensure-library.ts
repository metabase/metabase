import { useEffect, useRef } from "react";

import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useCreateLibraryMutation } from "metabase-enterprise/api";

import { useGetLibraryCollection } from "../use-get-library-collection";

/**
 * PROTOTYPE: the Library (semantic layer) exists by default. When an admin
 * opens Data Studio on an instance without one, create it once, so there is no
 * "create your semantic layer" state.
 */
export function useEnsureLibrary() {
  const isAdmin = useSelector(getUserIsAdmin);
  const {
    data: library,
    isLoading,
    error,
  } = useGetLibraryCollection({
    skip: !isAdmin,
  });
  const [createLibrary] = useCreateLibraryMutation();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!isAdmin || isLoading || error || library || hasRequestedRef.current) {
      return;
    }
    hasRequestedRef.current = true;
    createLibrary();
  }, [isAdmin, isLoading, error, library, createLibrary]);
}
