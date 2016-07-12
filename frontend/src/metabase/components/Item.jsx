/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./List.css";

import Urls from "metabase/lib/urls";
import Icon from "./Icon.jsx";

import cx from "classnames";
import pure from "recompose/pure";

//TODO: extend this to support functionality required for questions
const Item = ({ id, name, description, placeholder, url, icon, isEditing, field }) =>
    <div className={cx(S.item)}>
        <div className={S.leftIcons}>
        </div>
        <div className={S.itemBody}>
            <div className={S.itemTitle}>
                { url ?
                    <Link to={url} className={S.itemName}>{name}</Link> :
                    <span className={S.itemName}>{name}</span>
                }
            </div>
            <div className={cx(S.itemSubtitle, { "mt1" : true })}>
                { isEditing ?
                    <textarea
                        className={S.itemTextArea}
                        placeholder={placeholder}
                        {...field}
                        defaultValue={description}
                    /> :
                    description || placeholder || 'No description yet'
                }
            </div>
        </div>
    </div>

Item.propTypes = {
    id:                 PropTypes.string.isRequired,
    name:               PropTypes.string.isRequired,
    url:                PropTypes.string,
    description:        PropTypes.string,
    placeholder:        PropTypes.string,
    icon:               PropTypes.string,
    isEditing:          PropTypes.bool,
    field:          PropTypes.object
};

export default pure(Item);
