/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import S from "metabase/components/List.css";
import F from "./Field.css";

import Urls from "metabase/lib/urls";
import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";
import pure from "recompose/pure";

const Field = ({
    field: { id, name, display_name },
    url,
    icon,
    isEditing,
    formField
}) =>
    <div className={cx(S.item)}>
        <div className={S.leftIcons}>
        </div>
        <div className={S.itemBody}>
            <div className={F.field}>
                <div className={cx(S.itemTitle, F.fieldName)}>
                    { isEditing ?
                        <input
                            className={S.itemTitleTextInput}
                            type="text"
                            placeholder={display_name}
                            defaultValue={display_name}
                        /> :
                        <Link to={url} className={S.itemName}>{display_name}</Link>
                    }
                </div>
                <div className={F.fieldType}>
test
                </div>
                <div className={F.fieldDataType}>
test
                </div>
            </div>
            <div className={cx(S.itemSubtitle, { "mt1" : true })}>
                { name }
            </div>
        </div>
    </div>

Field.propTypes = {
    field: PropTypes.object.isRequired,
    url: PropTypes.string.isRequired,
    placeholder:        PropTypes.string,
    icon:               PropTypes.string,
    isEditing:          PropTypes.bool,
    formField:              PropTypes.object
};

export default pure(Field);
