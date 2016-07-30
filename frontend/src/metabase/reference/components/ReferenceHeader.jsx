import React, { Component, PropTypes } from "react";
import { Link } from "react-router";
import cx from "classnames";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import IconBorder from "metabase/components/IconBorder.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

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
        <div className={cx("relative", S.header)} style={section.type === 'segment' ? {marginBottom: 0} : {}}>
            <div className={S.leftIcons}>
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
                <div className={R.headerSchema}>{entity.schema}</div>
            }
            <div
                className={R.headerBody}
                style={isEditing && section.name === 'Details' ? {alignItems: "flex-start"} : {}}
            >
                { isEditing && section.name === 'Details' ?
                    hasDisplayName ?
                        <input
                            className={R.headerTextInput}
                            type="text"
                            placeholder={entity.name}
                            {...displayNameFormField}
                            defaultValue={entity.display_name}
                        /> :
                        <input
                            className={R.headerTextInput}
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
                                    className={cx("Button", "Button--borderless", R.editButton)}
                                    data-metabase-event={`Data Reference;Entity -> QB click;${section.type}`}
                                >
                                    <div className="flex align-center relative">
                                        <span className="mr1">See this {section.type}</span>
                                        <Icon name="chevronright" size={16} />
                                    </div>
                                </Link>
                            </div>
                    ]
                }
                { user && user.is_superuser && !isEditing &&
                    <div className={S.headerButton}>
                        <a
                            onClick={startEditing}
                            className={cx("Button", "Button--borderless", R.editButton)}
                        >
                            <div className="flex align-center relative">
                                <Icon name="pencil" size={16} />
                                <span className="ml1">Edit</span>
                            </div>
                        </a>
                    </div>
                }
            </div>
        </div>
        { section.type === 'segment' && table &&
            <div className={R.subheader}>
                <div className={cx(R.subheaderBody)}>
                    A subset of <Link
                        className={R.subheaderLink}
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

export default ReferenceHeader;
