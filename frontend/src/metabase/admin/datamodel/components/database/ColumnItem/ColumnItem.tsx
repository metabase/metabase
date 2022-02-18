import React from "react";
import { Link, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import InputBlurChange from "metabase/components/InputBlurChange";
import Button from "metabase/core/components/Button";

import FieldVisibilityPicker from "../FieldVisibilityPicker";
import SemanticTypeAndTargetPicker from "../SemanticTypeAndTargetPicker";
import { Field } from "metabase-types/types/Field";
import { OnChangeHandler } from "metabase/core/components/Select";
import {
  ColumnItemContent,
  ColumnItemFieldGroup,
  ColumnItemRoot,
} from "./ColumnItem.styled";

interface ColumnItemProps {
  field: Field;
  idfields: any[];
  updateField: (field: Field) => Promise<void>;
  dragHandle: React.ReactNode;
  canEditDataModel?: boolean;
}

const ColumnItem = ({
  field,
  idfields,
  dragHandle,
  canEditDataModel,
  updateField,
}: ColumnItemProps) => {
  const handleUpdateField = (fieldPartial: Partial<Field>) => {
    return updateField({ ...field, ...fieldPartial });
  };

  const handleChangeName: OnChangeHandler<string> = ({
    target: { value: display_name },
  }) => {
    if (!_.isEmpty(display_name)) {
      handleUpdateField({ display_name });
    } else {
      // if the user set this to empty then simply reset it because that's not allowed!
      handleUpdateField({ display_name: field.display_name });
    }
  };

  const handleChangeDescription: OnChangeHandler<string> = ({
    target: { value: description },
  }) => {
    handleUpdateField({ description });
  };

  return (
    <ColumnItemRoot>
      <ColumnItemContent>
        <div>
          <InputBlurChange
            style={{ minWidth: 420 }}
            className="AdminInput TableEditor-field-name float-left bordered inline-block rounded text-bold"
            type="text"
            value={field.display_name || ""}
            onBlurChange={handleChangeName}
            disabled={!canEditDataModel}
          />

          <ColumnItemFieldGroup>
            <div className="pl1 flex-auto">
              <FieldVisibilityPicker
                field={field}
                updateField={handleUpdateField}
                disabled={!canEditDataModel}
              />
            </div>
            <div className="px1 flex-auto">
              <SemanticTypeAndTargetPicker
                field={field}
                updateField={handleUpdateField}
                idfields={idfields}
                disabled={!canEditDataModel}
              />
            </div>
            <Link
              to={`${location.pathname}/${field.id}`}
              className="text-brand-hover mr1"
            >
              <Button icon="gear" style={{ padding: 10 }} />
            </Link>
          </ColumnItemFieldGroup>
        </div>
        <div className="MetadataTable-title flex flex-column flex-full mt1 mr1">
          <InputBlurChange
            className="AdminInput TableEditor-field-description bordered rounded"
            type="text"
            value={field.description || ""}
            onBlurChange={handleChangeDescription}
            placeholder={t`No column description yet`}
            disabled={!canEditDataModel}
          />
        </div>
      </ColumnItemContent>
      {canEditDataModel ? dragHandle : null}
    </ColumnItemRoot>
  );
};

export default withRouter(ColumnItem);
