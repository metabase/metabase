import { useCollectionQuery } from "metabase/common/hooks";
import { Text } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export const CollectionBreadcrumbs = ({
  collectionId,
  color,
}: {
  collectionId: CollectionId;
  color: string;
}) => {
  const { data: collection } = useCollectionQuery({ id: collectionId });

  if (collection) {
    const ancestors = collection.effective_ancestors || [];
    const path = ancestors.map(a => a.name).concat(collection.name);

    return (
      <Text
        component="span"
        ml="0.25rem"
        c={color}
        fz="12px"
        lh="1rem"
        fw="normal"
      >
        {`—  ${path.join(" / ")}`}
      </Text>
    );
  }

  return null;
};
