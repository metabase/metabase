import { useDatabaseQuery } from "metabase/common/hooks";
import { Text } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

export const DatabaseBreadcrumbs = ({
  databaseId,
  color,
}: {
  databaseId: DatabaseId;
  color: string;
}) => {
  const { data: database } = useDatabaseQuery({ id: databaseId });

  if (database) {
    return (
      <Text
        component="span"
        ml="0.25rem"
        c={color}
        fz="12px"
        lh="1rem"
        fw="normal"
      >
        {`—  ${database.name}`}
      </Text>
    );
  }

  return null;
};
