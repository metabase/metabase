/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import S from "./SearchHeader.css";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

const SearchHeader = ({ searchText, setSearchText }) =>
    <div className={S.searchHeader}>
        <Icon className={S.searchIcon} name="search" width={18} height={18} />
        <input
            className={cx("input", S.searchBox)}
            type="text"
            placeholder="Search for a question..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
        />
    </div>

SearchHeader.propTypes = {
    searchText: PropTypes.string.isRequired,
    setSearchText: PropTypes.func.isRequired,
};

export default SearchHeader;
