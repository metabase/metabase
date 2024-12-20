import cx from "classnames";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";
import { useDebounce } from "react-use";
import { t } from "ttag";

import { useSearchQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import { DEFAULT_SEARCH_LIMIT } from "metabase/lib/constants";
import { useDispatch } from "metabase/lib/redux";
import { SearchResult } from "metabase/search/components/SearchResult/SearchResult";
import { Box, Icon } from "metabase/ui";

import { CONTAINER_WIDTH } from "../constants";

import S from "./SearchResults.module.css";

const propTypes = {
  databaseId: PropTypes.string,
  searchQuery: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  searchModels: PropTypes.arrayOf(
    PropTypes.oneOf(["card", "dataset", "table", "metric"]),
  ),
};

const SEARCH_DEBOUNCE_DURATION = 250;

export function SearchResults({
  searchQuery,
  onSelect,
  databaseId,
  searchModels,
}) {
  const [debouncedSearchText, setDebouncedSearchText] = useState(searchQuery);

  useDebounce(
    () => {
      setDebouncedSearchText(searchQuery);
    },
    SEARCH_DEBOUNCE_DURATION,
    [searchQuery],
  );

  const query = {
    q: debouncedSearchText,
    models: searchModels,
    limit: DEFAULT_SEARCH_LIMIT,
  };

  if (databaseId) {
    query["table_db_id"] = databaseId;
  }

  const { data, error, isFetching } = useSearchQuery(query, {
    refetchOnMountOrArgChange: true,
  });
  const dispatch = useDispatch();
  const list = useMemo(() => {
    return data?.data?.map(item => Search.wrapEntity(item, dispatch));
  }, [data, dispatch]);

  return (
    <Box w={CONTAINER_WIDTH} className={S.Root}>
      {(error || isFetching) && (
        <LoadingAndErrorWrapper error={error} loading={isFetching} />
      )}

      {!error && !isFetching && list.length === 0 && (
        <div
          className={cx(
            CS.flex,
            CS.flexColumn,
            CS.alignCenter,
            CS.justifyCenter,
            CS.p4,
            CS.textMedium,
            CS.textCentered,
          )}
        >
          <div className={CS.my4}>
            <Icon name="search" className={CS.mb1} size={32} />
            <h3 className={CS.textLight}>{t`No results found`}</h3>
          </div>
        </div>
      )}

      {!error && !isFetching && list.length > 0 && (
        <ul>
          {list.map(item => (
            <li key={`${item.id}_${item.model}`}>
              <SearchResult
                result={item}
                onClick={onSelect}
                compact
                showDescription={false}
              />
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

SearchResults.propTypes = propTypes;
