import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import { t } from "ttag";
import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";

import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import Ellipsified from "metabase/core/components/Ellipsified";
import Button from "metabase/core/components/Button";

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
  nameFormField,
  displayNameFormField,
  onChangeName = nameFormField?.onChange,
  onChangeDisplayName = displayNameFormField?.onChange,
}) => (
  <div className="wrapper">
    <div className={cx("relative", L.header)}>
      <div className="flex align-center mr1">
        {headerIcon && (
          <Icon className="text-light" name={headerIcon} size={21} />
        )}
      </div>
      {type === "table" && !hasSingleSchema && !isEditing && (
        <div className={S.headerSchema}>{entity.schema}</div>
      )}
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
            name={hasDisplayName ? "display_name" : "name"}
            placeholder={entity.name}
            onChange={hasDisplayName ? onChangeDisplayName : onChangeName}
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
              <Button
                primary
                className="flex flex-align-right mr2"
                style={{ fontSize: 14 }}
                data-metabase-event={`Data Reference;Entity -> QB click;${type}`}
              >
                <Link to={headerLink}>{t`See this ${type}`}</Link>
              </Button>
            ),
          ]
        )}
        {user && user.is_superuser && !isEditing && (
          <Button icon="pencil" style={{ fontSize: 14 }} onClick={startEditing}>
            {t`Edit`}
          </Button>
        )}
      </div>
    </div>
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
  nameFormField: PropTypes.object,
  displayNameFormField: PropTypes.object,
  onChangeName: PropTypes.func,
  onChangeDisplayName: PropTypes.func,
};

export default React.memo(EditableReferenceHeader);
