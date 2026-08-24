import { useAddDataState } from "./AddDataModal/use-add-data-state";

/**
 * Whether to offer the "Add data" entry points in the navbar. Shares
 * `useAddDataState` with the modal it opens so the two cannot disagree.
 */
export function useCanAddData() {
  // No separate admin term: `canManageUploads` is `canAccessSettings`, which
  // admins always pass.
  const { canUploadToDatabase, canManageUploads } = useAddDataState();

  return canUploadToDatabase || canManageUploads;
}
