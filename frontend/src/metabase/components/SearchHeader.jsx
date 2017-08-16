/* eslint "react/prop-types": "warn" */
import React from "react";
import PropTypes from "prop-types";
import S from "./SearchHeader.css";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const SearchHeader = ({ searchText, setSearchText, autoFocus }) =>
    <div className={S.searchHeader}>
        <Icon className={S.searchIcon} name="search" size={18} />
        <input
            className={cx("input bg-transparent", S.searchBox)}
            type="text"
            placeholder="Filter this list..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            autoFocus={!!autoFocus}
        />
    </div>

SearchHeader.propTypes = {
    searchText: PropTypes.string.isRequired,
    setSearchText: PropTypes.func.isRequired,
    autoFocus: PropTypes.bool
};

export default SearchHeader;
