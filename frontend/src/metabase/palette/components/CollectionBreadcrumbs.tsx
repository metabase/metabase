import { useCollectionQuery } from "metabase/common/hooks";
import { Text, Tooltip } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export const CollectionBreadcrumbs = ({
  collectionId,
  color,
}: {
  collectionId: CollectionId;
  color: string;
}) => {
  const { data: collection } = useCollectionQuery({ id: collectionId });
  const textProps = {
    component: "span" as const,
    ml: "0.25rem",
    c: color,
    fz: "0.75rem",
    lh: "1rem",
    fw: "normal" as const,
  };

  if (collection) {
    const ancestors = collection.effective_ancestors || [];
    const path = ancestors.map(a => a.name).concat(collection.name);

    if (path.length > 3) {
      return (
        <Tooltip label={path.join(" / ")}>
          <Text {...textProps}>
            {`—  ${path[0]} / ... / ${path[path.length - 1]}`}
          </Text>
        </Tooltip>
      );
    } else {
      return <Text {...textProps}>{`—  ${path.join(" / ")}`}</Text>;
    }
  }

  return null;
};
