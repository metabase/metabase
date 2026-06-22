import { useGetCollectionQuery } from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { useTranslateContent } from "metabase/i18n/hooks";
import { getName } from "metabase/utils/name";
import type { CollectionId } from "metabase-types/api";

interface CollectionNameProps {
  id: CollectionId | null | undefined;
}

export const CollectionName = ({ id }: CollectionNameProps) => {
  const tc = useTranslateContent();

  if (id === "root" || id === null) {
    return <span>{tc(ROOT_COLLECTION.name)}</span>;
  }
  if (id === undefined || (typeof id === "number" && isNaN(id))) {
    return null;
  }
  return <FetchedCollectionName id={id} />;
};

const FetchedCollectionName = ({ id }: { id: CollectionId }) => {
  const tc = useTranslateContent();
  const { data: collection } = useGetCollectionQuery({ id });
  if (!collection) {
    return null;
  }
  return <span>{tc(getName(collection))}</span>;
};
