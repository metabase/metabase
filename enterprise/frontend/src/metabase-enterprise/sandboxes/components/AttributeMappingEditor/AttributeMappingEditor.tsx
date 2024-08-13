import cx from "classnames";
import { t } from "ttag";

import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select, { Option } from "metabase/core/components/Select";
import Tooltip from "metabase/core/components/Tooltip";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type { GroupTableAccessPolicyDraft } from "metabase-enterprise/sandboxes/types";
import { getRawDataQuestionForTable } from "metabase-enterprise/sandboxes/utils";
import type {
  GroupTableAccessPolicy,
  Table,
  UserAttribute,
} from "metabase-types/api";

import QuestionParameterTargetWidget from "../../containers/QuestionParameterTargetWidget";
import { MappingEditor } from "../MappingEditor";

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
          tooltip={t`We can automatically get your users’ attributes if you’ve set up SSO, or you can add them manually from the "…" menu in the People section of the Admin Panel.`}
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
  value: any;
  onChange: (value: any) => void;
  attributesOptions: UserAttribute[];
}

const AttributePicker = ({
  value,
  onChange,
  attributesOptions,
}: AttributePickerProps) => (
  <div style={{ minWidth: 200 }}>
    <Select
      value={value}
      onChange={(e: SelectChangeEvent<string>) => onChange(e.target.value)}
      placeholder={
        attributesOptions.length === 0
          ? t`No user attributes`
          : t`Pick a user attribute`
      }
      disabled={attributesOptions.length === 0}
    >
      {attributesOptions.map(attributesOption => (
        <Option key={attributesOption} value={attributesOption}>
          {attributesOption}
        </Option>
      ))}
    </Select>
  </div>
);
