import cx from "classnames";
import { t } from "ttag";

import { MappingEditor } from "metabase/common/components/MappingEditor";
import CS from "metabase/css/core/index.css";
import { Icon, Select, Tooltip } from "metabase/ui";
import type { GroupTableAccessPolicyDraft } from "metabase-enterprise/sandboxes/types";
import {
  getRawDataQuestionForTable,
  renderUserAttributesForSelect,
} from "metabase-enterprise/sandboxes/utils";
import type {
  GroupTableAccessPolicy,
  Table,
  UserAttribute,
} from "metabase-types/api";

import QuestionParameterTargetWidget from "../../containers/QuestionParameterTargetWidget";

interface AttributeMappingEditorProps {
  value: any;
  policyTable: Table | undefined;
  onChange: (value: any) => void;
  shouldUseSavedQuestion: boolean;
  attributesOptions: UserAttribute[];
  policy: GroupTableAccessPolicy | GroupTableAccessPolicyDraft;
}

const AttributeMappingEditor = ({
  value,
  policyTable,
  onChange,
  shouldUseSavedQuestion,
  attributesOptions,
  policy,
}: AttributeMappingEditorProps) => (
  <MappingEditor
    style={{ width: "100%" }}
    value={value}
    onChange={onChange}
    keyPlaceholder={t`Pick a user attribute`}
    keyHeader={
      <div
        className={cx(CS.textUppercase, CS.textSmall, CS.flex, CS.alignCenter)}
      >
        {t`User attribute`}
        <Tooltip
          label={t`We can automatically get your users’ attributes if you’ve set up SSO, or you can add them manually from the "…" menu in the People section of the Admin Panel.`}
        >
          <Icon className={CS.ml1} name="info_outline" />
        </Tooltip>
      </div>
    }
    renderKeyInput={({ value, onChange }) => (
      <AttributePicker
        value={value}
        onChange={onChange}
        attributesOptions={(value ? [value] : []).concat(attributesOptions)}
      />
    )}
    valuePlaceholder={
      shouldUseSavedQuestion ? t`Pick a parameter` : t`Pick a column`
    }
    valueHeader={
      <div className={cx(CS.textUppercase, CS.textSmall)}>
        {shouldUseSavedQuestion ? t`Parameter or variable` : t`Column`}
      </div>
    }
    renderValueInput={({ value, onChange }) =>
      !shouldUseSavedQuestion && policy.table_id != null ? (
        <div style={{ minWidth: 200 }}>
          <QuestionParameterTargetWidget
            questionObject={
              policyTable ? getRawDataQuestionForTable(policyTable) : null
            }
            target={value}
            onChange={onChange}
            placeholder={t`Pick a column`}
          />
        </div>
      ) : shouldUseSavedQuestion && policy.card_id != null ? (
        <div style={{ minWidth: 200 }}>
          <QuestionParameterTargetWidget
            questionId={policy.card_id}
            target={value}
            onChange={onChange}
            placeholder={t`Pick a parameter`}
          />
        </div>
      ) : null
    }
    divider={<span className={cx(CS.px2, CS.textBold)}>{t`equals`}</span>}
    addText={t`Add a filter`}
    canAdd={attributesOptions.length > 0}
    canDelete={true}
    swapKeyAndValue
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AttributeMappingEditor;

interface AttributePickerProps {
  value: string;
  onChange?: (value: string) => void;
  attributesOptions: UserAttribute[];
}

const AttributePicker = ({
  value,
  onChange,
  attributesOptions,
}: AttributePickerProps) => {
  return (
    <div style={{ minWidth: 200 }}>
      <Select
        value={value}
        onChange={(value) => onChange?.(value)}
        placeholder={
          attributesOptions.length === 0
            ? t`No user attributes`
            : t`Pick a user attribute`
        }
        disabled={attributesOptions.length === 0}
        data={attributesOptions}
        renderOption={renderUserAttributesForSelect}
      ></Select>
    </div>
  );
};
