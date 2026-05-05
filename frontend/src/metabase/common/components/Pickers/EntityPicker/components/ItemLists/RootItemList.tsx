import { ItemList } from "../..";
import { useRootItems } from "../../hooks/use-get-root-items";

export const RootItemList = ({
  isLoading: isLoadingProp,
}: {
  isLoading: boolean;
}) => {
  const { items, isLoading } = useRootItems();

  return (
    <ItemList
      items={items}
      isLoading={isLoading || isLoadingProp}
      pathIndex={-1}
    />
  );
};
