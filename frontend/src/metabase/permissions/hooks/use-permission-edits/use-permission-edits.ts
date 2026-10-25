import { useCallback, useEffect, useMemo, useState } from "react";
import _ from "underscore";

export function usePermissionEdits<Permissions, Edit>(
  savedPermissions: Permissions | undefined,
  applyEdit: (
    permissions: Permissions,
    savedPermissions: Permissions,
    edit: Edit,
  ) => Permissions,
) {
  const [edits, setEdits] = useState<Edit[]>([]);

  const permissions = useMemo(
    () =>
      savedPermissions &&
      edits.reduce<Permissions>(
        (permissions, edit) => applyEdit(permissions, savedPermissions, edit),
        savedPermissions,
      ),
    [savedPermissions, edits, applyEdit],
  );

  const isDirty = useMemo(
    () => !_.isEqual(permissions, savedPermissions),
    [permissions, savedPermissions],
  );

  useEffect(() => {
    if (!isDirty && edits.length > 0) {
      setEdits([]);
    }
  }, [isDirty, edits.length]);

  const addEdit = useCallback(
    (edit: Edit) => setEdits((edits) => [...edits, edit]),
    [],
  );

  const clearEdits = useCallback(() => setEdits([]), []);

  return { permissions, isDirty, addEdit, clearEdits };
}
