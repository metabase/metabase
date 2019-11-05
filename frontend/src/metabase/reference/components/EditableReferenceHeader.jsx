import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import cx from "classnames";
import pure from "recompose/pure";
import { t } from "ttag";
import S from "./ReferenceHeader.css";
import L from "metabase/components/List.css";

import IconBorder from "metabase/components/IconBorder";
import Icon from "metabase/components/Icon";
import InputBlurChange from "metabase/components/InputBlurChange";
import Ellipsified from "metabase/components/Ellipsified";
import Button from "metabase/components/Button";

import { color } from "metabase/lib/colors";

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
          <Button
            secondary
            icon="pencil"
            style={{ fontSize: 14 }}
            onClick={startEditing}
          >
            {t`Edit`}
          </Button>
        )}
      </div>
    </div>
    {type === "segment" && table && (
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
