import React, { Component, PropTypes } from "react";

import S from "metabase/components/List.css";
import R from "metabase/reference/Reference.css";

import IconBorder from "metabase/components/IconBorder.jsx";
import Icon from "metabase/components/Icon.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";

import cx from "classnames";

const ReferenceHeader = ({ section, user, isEditing, startEditing }) =>
    <div className="wrapper wrapper--trim">
        <div className={S.header}>
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
            <div className={R.headerBody}>
                <Ellipsified className="flex-full" tooltipMaxWidth="100%">
                    {section.name}
                </Ellipsified>
                { user && user.is_superuser && !isEditing &&
                    <div className={S.headerButton}>
                        <a
                            onClick={startEditing}
                            className={cx("Button", "Button--borderless", R.editButton)}
                        >
                            <div className="flex align-center relative">
                                <Icon name="pencil" width="16px" height="16px" />
                                <span className="ml1">Edit</span>
                            </div>
                        </a>
                    </div>
                }
            </div>
        </div>
    </div>

export default ReferenceHeader;
