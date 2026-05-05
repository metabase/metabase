import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { CollectionId } from "metabase-types/api";

interface CollectionNameProps {
  id: CollectionId | null | undefined;
}

export const CollectionName = ({ id }: CollectionNameProps) => {
  const tc = useTranslateContent();

  if (id === "root" || id === null) {
    return <span>{tc(ROOT_COLLECTION.name)}</span>;
  } else if (id === undefined || (typeof id === "number" && isNaN(id))) {
    return null;
  } else {
    return <Collections.Name id={id} />;
  }
};
