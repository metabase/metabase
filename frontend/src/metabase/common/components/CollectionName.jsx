/* eslint-disable react/prop-types */
import { Collections, ROOT_COLLECTION } from "metabase/entities/collections";
import { useTranslateContent } from "metabase/i18n/hooks";

export const CollectionName = ({ id }) => {
  const tc = useTranslateContent();

  if (id === "root" || id === null) {
    return <span>{tc(ROOT_COLLECTION.name)}</span>;
  } else if (id === undefined || isNaN(id)) {
    return null;
  } else {
    return <Collections.Name id={id} />;
  }
};
