import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import { Tooltip } from "metabase/core/components/Tooltip";
import Select, {
  Option,
  SelectChangeEvent,
} from "metabase/core/components/Select";
import { GroupTableAccessPolicy, UserAttribute } from "metabase-types/api";
import { getRawDataQuestionForTable } from "metabase-enterprise/sandboxes/utils";
import { GroupTableAccessPolicyDraft } from "metabase-enterprise/sandboxes/types";
import QuestionParameterTargetWidget from "../../containers/QuestionParameterTargetWidget";

import MappingEditor from "../MappingEditor";

interface AttributeMappingEditorProps {
  value: any;
  onChange: (value: any) => void;
  shouldUseSavedQuestion: boolean;
  attributesOptions: UserAttribute[];
  policy: GroupTableAccessPolicy | GroupTableAccessPolicyDraft;
}

const AttributeMappingEditor = ({
  value,
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
      <div className="text-uppercase text-small text-grey-4 flex align-center">
        {t`User attribute`}
        <Tooltip
          tooltip={t`We can automatically get your users’ attributes if you’ve set up SSO, or you can add them manually from the "…" menu in the People section of the Admin Panel.`}
        >
          <Icon className="ml1" name="info_outline" />
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
      <div className="text-uppercase text-small text-grey-4">
        {shouldUseSavedQuestion ? t`Parameter or variable` : t`Column`}
      </div>
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    renderValueInput={({ value, onChange }) =>
      !shouldUseSavedQuestion && policy.table_id != null ? (
        <div style={{ minWidth: 200 }}>
          <QuestionParameterTargetWidget
            questionObject={getRawDataQuestionForTable(policy.table_id)}
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
    divider={<span className="px2 text-bold">{t`equals`}</span>}
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
