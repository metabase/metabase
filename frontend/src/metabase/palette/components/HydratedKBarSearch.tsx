import { KBarSearch, useKBar } from "kbar";
import { useEffect, useState } from "react";
import { t } from "ttag";

import S from "./HydratedKBarSearch.module.css";

/**
 * KBarSearch component wrapper, that initializes the input state based on
 * existing `searchText` value before rendering the component.
 */
export const HydratedKBarSearch = ({ searchText }: { searchText: string }) => {
  const { query, searchQuery } = useKBar((state) => ({
    searchQuery: state.searchQuery,
  }));
  const [isHydrated, setIsHydrated] = useState(searchText === "");

  useEffect(() => {
    setIsHydrated(searchText === "");

    if (searchText) {
      query.setSearch(searchText);
    }
  }, [query, searchText]);

  useEffect(() => {
    if (searchQuery === searchText) {
      setIsHydrated(true);
    }
  }, [searchQuery, searchText]);

  useEffect(() => {
    if (isHydrated && searchText) {
      query.setSearch(searchText);
    }
  }, [isHydrated, query, searchText]);

  if (!isHydrated) {
    return null;
  }

  return (
    <KBarSearch
      className={S.input}
      defaultPlaceholder={t`Search for anything…`}
    />
  );
};
