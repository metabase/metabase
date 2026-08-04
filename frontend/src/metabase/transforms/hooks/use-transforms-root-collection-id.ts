import { useGetCollectionQuery } from "metabase/api";

export function useTransformsRootCollectionId(): number | undefined {
  const { data: collection } = useGetCollectionQuery({
    id: "root",
    namespace: "transforms",
  });
  return typeof collection?.id === "number" ? collection.id : undefined;
}
