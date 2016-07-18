/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import S from "./Detail.css";

import Icon from "./Icon.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const Detail = ({ name, description, placeholder, url, icon, isEditing, field }) =>
    <div className={cx(S.detail)}>
        <div className={S.detailBody}>
            <div className={S.detailTitle}>
                { url ?
                    <Link to={url} className={S.detailName}>{name}</Link> :
                    <span className={S.detailName}>{name}</span>
                }
            </div>
            <div className={cx(S.detailSubtitle, { "mt1" : true })}>
                { isEditing ?
                    <textarea
                        className={S.detailTextArea}
                        placeholder={placeholder}
                        {...field}
                        defaultValue={description}
                    /> :
                    description || placeholder || 'No description yet'
                }
                { isEditing && field.error && field.touched &&
                    <span className="text-error">{field.error}</span>
                }
            </div>
        </div>
    </div>

Detail.propTypes = {
    name:               PropTypes.string.isRequired,
    url:                PropTypes.string,
    description:        PropTypes.string,
    placeholder:        PropTypes.string,
    icon:               PropTypes.string,
    isEditing:          PropTypes.bool,
    field:              PropTypes.object
};

export default pure(Detail);
