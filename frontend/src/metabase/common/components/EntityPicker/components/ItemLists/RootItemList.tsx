import { ItemList } from "../..";
import { useRootItems } from "../../hooks/use-get-root-items";

export const RootItemList = () => {
  const { items, isLoading } = useRootItems();

  return <ItemList items={items} isLoading={isLoading} pathIndex={-1} />;
};
