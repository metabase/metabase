/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./List.css";

import Urls from "metabase/lib/urls";
import Icon from "./Icon.jsx";

import cx from "classnames";
import pure from "recompose/pure";

//TODO: extend this to support functionality required for questions
const Item = ({ id, name, description, url, icon }) =>
    <div className={cx(S.item)}>
        <div className={S.leftIcons}>
        </div>
        <div className={S.itemBody}>
            <div className={S.itemTitle}>
                <Link to={url} className={S.itemName}>{name}</Link>
            </div>
            <div className={cx(S.itemSubtitle, { "mt1" : true })}>
              { description || "No description" }
            </div>
        </div>
    </div>

Item.propTypes = {
    id:                 PropTypes.number.isRequired,
    name:               PropTypes.string.isRequired,
    description:        PropTypes.string.isRequired,
    url:                PropTypes.string.isRequired,
    icon:               PropTypes.string
};

export default pure(Item);
