import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import InputBlurChange from "metabase/components/InputBlurChange";
import L from "metabase/components/List/List.module.css";
import Button from "metabase/core/components/Button";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import S from "./ReferenceHeader.module.css";

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
  <div className={CS.wrapper}>
    <div className={cx(CS.relative, L.header)}>
      <div className={cx(CS.flex, CS.alignCenter, CS.mr1)}>
        {headerIcon && (
          <Icon className={CS.textLight} name={headerIcon} size={21} />
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
            name={
              hasDisplayName ? displayNameFormField.name : nameFormField.name
            }
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
              className={!headerLink && CS.flexFull}
              tooltipMaxWidth="auto"
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
                className={cx(CS.flex, CS.flexAlignRight, CS.mr2)}
                style={{ fontSize: 14 }}
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
  displayNameFormField: PropTypes.object,
  nameFormField: PropTypes.object,
};

export default memo(EditableReferenceHeader);
