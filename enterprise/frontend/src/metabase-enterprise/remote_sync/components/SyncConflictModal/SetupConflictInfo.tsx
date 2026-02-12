import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Text } from "metabase/ui";
import { getCurrentTask } from "metabase-enterprise/remote_sync/selectors";

export const SetupConflictInfo = () => {
  const conflictedEntityNames = useConflictedEntityNames();

  return (
    <>
      <Text component="p">
        {t`We detected your instance has unsynced items that will be overwritten by setting up Remote Sync.`}
      </Text>
      <Text component="p">
        {t`What will be overwritten: `}
        <Text component="em" display="inline" fw="bold" fs="normal">
          {conflictedEntityNames}
        </Text>
      </Text>
    </>
  );
};

const useConflictedEntityNames = () => {
  const currentTask = useSelector(getCurrentTask);

  return useMemo(() => {
    const conflictKeys = (currentTask?.conflicts || []).map((key) =>
      key.toLowerCase(),
    );
    const names = [];
    const conflictNameMap: Record<string, string> = {
      transforms: t`Transforms`,
      snippets: t`Snippets`,
      library: t`Library`,
    };

    for (const conflictKey of conflictKeys) {
      if (conflictNameMap[conflictKey]) {
        names.push(conflictNameMap[conflictKey]);
      }
    }

    if (!names?.length) {
      return t`Library, Transforms and Snippets.`;
    }

    return names.join(", ");
  }, [currentTask]);
};
