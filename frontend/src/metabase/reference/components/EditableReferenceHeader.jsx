import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "c-3po";
import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";
import E from "metabase/reference/components/EditButton.css";

import IconBorder from "metabase/components/IconBorder.jsx";
import Icon from "metabase/components/Icon.jsx";
import InputBlurChange from "metabase/components/InputBlurChange.jsx";
import Ellipsified from "metabase/components/Ellipsified.jsx";
import EditButton from "metabase/reference/components/EditButton.jsx";

const EditableReferenceHeader = ({
  entity = {},
  table,
  type,
  headerIcon,
  headerLink,
  name,
  user,
  isEditing,
  hasSingleSchema,
  hasDisplayName,
  startEditing,
  displayNameFormField,
  nameFormField,
}) => (
  <div className="wrapper wrapper--trim">
    <div
      className={cx("relative", L.header)}
      style={type === "segment" ? { marginBottom: 0 } : {}}
    >
      <div className={L.leftIcons}>
        {headerIcon && (
          <IconBorder borderWidth="0" style={{ backgroundColor: "#E9F4F8" }}>
            <Icon
              className="text-brand"
              name={headerIcon}
              width={24}
              height={24}
            />
          </IconBorder>
        )}
      </div>
      {type === "table" &&
        !hasSingleSchema &&
        !isEditing && <div className={S.headerSchema}>{entity.schema}</div>}
      <div
        className={S.headerBody}
        style={
          isEditing && name === "Details" ? { alignItems: "flex-start" } : {}
        }
      >
        {isEditing && name === "Details" ? (
          <InputBlurChange
            className={S.headerTextInput}
            type="text"
            placeholder={entity.name}
            onChange={
              hasDisplayName
                ? displayNameFormField.onChange
                : nameFormField.onChange
            }
            defaultValue={hasDisplayName ? entity.display_name : entity.name}
          />
        ) : (
          [
            <Ellipsified
              key="1"
              className={!headerLink && "flex-full"}
              tooltipMaxWidth="100%"
            >
              {name === "Details"
                ? hasDisplayName
                  ? entity.display_name || entity.name
                  : entity.name
                : name}
            </Ellipsified>,
            headerLink && (
              <div key="2" className={cx("flex-full", S.headerButton)}>
                <Link
                  to={headerLink}
                  className={cx(
                    "Button",
                    "Button--borderless",
                    "ml3",
                    E.editButton,
                  )}
                  data-metabase-event={`Data Reference;Entity -> QB click;${type}`}
                >
                  <div className="flex align-center relative">
                    <span className="mr1 flex-no-shrink">{t`See this ${type}`}</span>
                    <Icon name="chevronright" size={16} />
                  </div>
                </Link>
              </div>
            ),
          ]
        )}
        {user &&
          user.is_superuser &&
          !isEditing && (
            <EditButton className="ml1" startEditing={startEditing} />
          )}
      </div>
    </div>
    {type === "segment" &&
      table && (
        <div className={S.subheader}>
          <div className={cx(S.subheaderBody)}>
            {t`A subset of`}{" "}
            <Link
              className={S.subheaderLink}
              to={`/reference/databases/${table.db_id}/tables/${table.id}`}
            >
              {table.display_name}
            </Link>
          </div>
        </div>
      )}
  </div>
);
EditableReferenceHeader.propTypes = {
  entity: PropTypes.object,
  table: PropTypes.object,
  type: PropTypes.string,
  headerIcon: PropTypes.string,
  headerLink: PropTypes.string,
  name: PropTypes.string,
  user: PropTypes.object,
  isEditing: PropTypes.bool,
  hasSingleSchema: PropTypes.bool,
  hasDisplayName: PropTypes.bool,
  startEditing: PropTypes.func,
  displayNameFormField: PropTypes.object,
  nameFormField: PropTypes.object,
};

export default pure(EditableReferenceHeader);
