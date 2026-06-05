import cx from "classnames";
import { memo } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import L from "metabase/common/components/List/List.module.css";
import CS from "metabase/css/core/index.css";
import { Button, Ellipsified, Icon, TextInputBlurChange } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ReferenceHeader.module.css";

interface FormField {
  name: string;
  onChange: (...args: unknown[]) => void;
}

interface EditableReferenceHeaderEntity {
  schema?: string;
  name?: string;
  display_name?: string;
}

interface EditableReferenceHeaderUser {
  is_superuser?: boolean;
}

interface EditableReferenceHeaderProps {
  entity?: EditableReferenceHeaderEntity;
  type?: string;
  headerIcon?: IconName;
  headerLink?: string;
  name?: string;
  user?: EditableReferenceHeaderUser | null;
  isEditing?: boolean;
  hasSingleSchema?: boolean;
  hasDisplayName?: boolean;
  startEditing?: () => void;
  displayNameFormField?: FormField;
  nameFormField?: FormField;
}

const EditableReferenceHeader = ({
  entity = {},
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
}: EditableReferenceHeaderProps) => (
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
          <TextInputBlurChange
            className={S.headerTextInput}
            type="text"
            name={
              hasDisplayName ? displayNameFormField?.name : nameFormField?.name
            }
            placeholder={entity.name}
            onChange={
              hasDisplayName
                ? displayNameFormField?.onChange
                : nameFormField?.onChange
            }
            value={undefined}
            defaultValue={hasDisplayName ? entity.display_name : entity.name}
          />
        ) : (
          [
            <Ellipsified
              key="1"
              className={!headerLink ? CS.flexFull : undefined}
              tooltipProps={{ w: "auto" }}
            >
              {name === "Details"
                ? hasDisplayName
                  ? entity.display_name || entity.name
                  : entity.name
                : name}
            </Ellipsified>,
            headerLink && (
              <Button
                key="2"
                variant="filled"
                className={cx(CS.flex, CS.flexAlignRight, CS.mr2)}
                style={{ fontSize: 14 }}
              >
                <Link to={headerLink}>{t`See this ${type}`}</Link>
              </Button>
            ),
          ]
        )}
        {user && user.is_superuser && !isEditing && (
          <Button
            leftSection={<Icon name="pencil" />}
            style={{ fontSize: 14 }}
            type="button"
            onClick={startEditing}
          >
            {t`Edit`}
          </Button>
        )}
      </div>
    </div>
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default memo(EditableReferenceHeader);
