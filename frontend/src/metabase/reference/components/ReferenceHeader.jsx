import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";

import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";
import E from "metabase/reference/components/EditButton.css";

import IconBorder from "metabase/components/IconBorder.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import EditButton from "metabase/reference/components/EditButton.jsx";


const ReferenceHeader = ({
    entity = {},
    table,
    section,
    user,
    isEditing,
    hasSingleSchema,
    hasDisplayName,
    startEditing,
    displayNameFormField,
    nameFormField
}) =>
    <div className="wrapper wrapper--trim">
        <div className={cx("relative", L.header)} style={section.type === 'segment' ? {marginBottom: 0} : {}}>
            <div className={L.leftIcons}>
                { section.headerIcon &&
                    <IconBorder
                        borderWidth="0"
                        style={{backgroundColor: "#E9F4F8"}}
                    >
                        <Icon
                            className="text-brand"
                            name={section.headerIcon}
                            width={24}
                            height={24}
                        />
                    </IconBorder>
                }
            </div>
            { section.type === 'table' && !hasSingleSchema && !isEditing &&
                <div className={S.headerSchema}>{entity.schema}</div>
            }
            <div
                className={S.headerBody}
                style={isEditing && section.name === 'Details' ? {alignItems: "flex-start"} : {}}
            >
                { isEditing && section.name === 'Details' ?
                    hasDisplayName ?
                        <input
                            className={S.headerTextInput}
                            type="text"
                            placeholder={entity.name}
                            {...displayNameFormField}
                            defaultValue={entity.display_name}
                        /> :
                        <input
                            className={S.headerTextInput}
                            type="text"
                            placeholder={entity.name}
                            {...nameFormField}
                            defaultValue={entity.name}
                        /> :
                    [
                        <Ellipsified
                            key="1"
                            className={!section.headerLink && "flex-full"}
                            tooltipMaxWidth="100%"
                        >
                            { section.name === 'Details' ?
                                hasDisplayName ?
                                    entity.display_name || entity.name :
                                    entity.name :
                                section.name
                            }
                        </Ellipsified>,
                        section.headerLink &&
                            <div key="2" className={cx("flex-full", S.headerButton)}>
                                <Link
                                    to={section.headerLink}
                                    className={cx("Button", "Button--borderless", "ml3", E.editButton)}
                                    data-metabase-event={`Data Reference;Entity -> QB click;${section.type}`}
                                >
                                    <div className="flex align-center relative">
                                        <span className="mr1 flex-no-shrink">See this {section.type}</span>
                                        <Icon name="chevronright" size={16} />
                                    </div>
                                </Link>
                            </div>
                    ]
                }
                { user && user.is_superuser && !isEditing &&
                    <EditButton className="ml1" startEditing={startEditing} />
                }
            </div>
        </div>
        { section.type === 'segment' && table &&
            <div className={S.subheader}>
                <div className={cx(S.subheaderBody)}>
                    A subset of <Link
                        className={S.subheaderLink}
                        to={`/reference/databases/${table.db_id}/tables/${table.id}`}
                    >
                        {table.display_name}
                    </Link>
                </div>
            </div>
        }
    </div>;
ReferenceHeader.propTypes = {
    entity: PropTypes.object,
    table: PropTypes.object,
    section: PropTypes.object.isRequired,
    user: PropTypes.object,
    isEditing: PropTypes.bool,
    hasSingleSchema: PropTypes.bool,
    hasDisplayName: PropTypes.bool,
    startEditing: PropTypes.func,
    displayNameFormField: PropTypes.object,
    nameFormField: PropTypes.object
};

export default pure(ReferenceHeader);
