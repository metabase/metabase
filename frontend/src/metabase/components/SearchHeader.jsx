/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "./SearchHeader.css";
import Icon from "metabase/components/Icon.jsx";
import cx from "classnames";
import { t } from "c-3po";

const SearchHeader = ({
  searchText,
  setSearchText,
  autoFocus,
  inputRef,
  resetSearchText,
}) => (
  <div className="flex align-center">
    <Icon className={S.searchIcon} name="search" size={18} />
    <input
      className={cx("input bg-transparent", S.searchBox)}
      type="text"
      placeholder={t`Filter this list...`}
      value={searchText}
      onChange={e => setSearchText(e.target.value)}
      autoFocus={!!autoFocus}
      ref={inputRef || (() => {})}
    />
    {resetSearchText &&
      searchText !== "" && (
        <Icon
          name="close"
          className="cursor-pointer text-light"
          size={18}
          onClick={resetSearchText}
        />
      )}
  </div>
);

SearchHeader.propTypes = {
  searchText: PropTypes.string.isRequired,
  setSearchText: PropTypes.func.isRequired,
  autoFocus: PropTypes.bool,
  inputRef: PropTypes.func,
  resetSearchText: PropTypes.func,
};

export default SearchHeader;
