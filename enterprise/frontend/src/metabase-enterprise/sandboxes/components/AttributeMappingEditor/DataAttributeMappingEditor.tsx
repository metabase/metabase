import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Box, Button, Icon, Select, Text, Tooltip } from "metabase/ui";
import QuestionParameterTargetWidget from "metabase-enterprise/sandboxes/containers/QuestionParameterTargetWidget";
import type { GroupTableAccessPolicyDraft } from "metabase-enterprise/sandboxes/types";
import {
  addEntry,
  getRawDataQuestionForTable,
  removeEntry,
  renderUserAttributesForSelect,
  replaceEntryKey,
  replaceEntryValue,
} from "metabase-enterprise/sandboxes/utils";
import type {
  GroupTableAccessPolicy,
  Table,
  UserAttributeKey,
} from "metabase-types/api";

type MappingValue = string;
type MappingType = Record<string, MappingValue>;

export interface MappingEditorProps {
  value: MappingType;
  onChange: (val: MappingType) => void;
  shouldUseSavedQuestion: boolean;
  attributesOptions: UserAttributeKey[];
  policyTable: Table | undefined;
  policy: GroupTableAccessPolicy | GroupTableAccessPolicyDraft;
}

export type MappingEditorEntry = {
  key: string;
  value: string;
};

const buildEntries = (mapping: MappingType): MappingEditorEntry[] =>
  Object.entries(mapping).map(([key, value]) => ({ key, value }));

const buildMapping = (entries: MappingEditorEntry[]): MappingType =>
  entries.reduce((memo: MappingType, { key, value }) => {
    if (key) {
      memo[key] = value;
    }
    return memo;
  }, {});

export const DataAttributeMappingEditor = ({
  value: mapping,
  onChange,
  shouldUseSavedQuestion,
  attributesOptions,
  policy,
  policyTable,
}: MappingEditorProps) => {
  const [entries, setEntries] = useState<MappingEditorEntry[]>(
    buildEntries({ ...mapping }),
  );

  const handleChange = (newEntries: MappingEditorEntry[]) => {
    setEntries(newEntries);
    onChange(buildMapping(newEntries));
  };

  return (
    <table style={{ width: "100%" }} data-testid="mapping-editor">
      <thead>
        <tr>
          <td>
            <div className={cx(CS.textUppercase, CS.textSmall)}>
              {shouldUseSavedQuestion ? t`Parameter or variable` : t`Column`}
            </div>
          </td>
          <td />
          <td>
            <div
              className={cx(
                CS.textUppercase,
                CS.textSmall,
                CS.flex,
                CS.alignCenter,
              )}
            >
              {t`User attribute`}
              <Tooltip
                label={t`We can automatically get your users’ attributes if you’ve set up SSO, or you can add them manually from the "…" menu in the People section of the Admin Panel.`}
              >
                <Icon className={CS.ml1} name="info_outline" />
              </Tooltip>
            </div>
          </td>
        </tr>
      </thead>
      <tbody>
        {entries.map(({ key, value }, index) => {
          return (
            <tr key={index}>
              <td
                className={CS.pb1}
                style={{ verticalAlign: "top", width: "auto" }}
              >
                <ColumnPicker
                  value={value}
                  onChange={(newValue) =>
                    handleChange(replaceEntryValue(entries, index, newValue))
                  }
                  policyTable={policyTable}
                  policy={policy}
                  shouldUseSavedQuestion={shouldUseSavedQuestion}
                />
              </td>
              <td
                className={cx(CS.pb1, CS.px1)}
                style={{ verticalAlign: "middle" }}
              >
                <Text fw="bold" px="sm">{t`equals`}</Text>
              </td>
              <td
                className={CS.pb1}
                style={{ verticalAlign: "top", width: "auto" }}
              >
                <AttributePicker
                  value={key}
                  onChange={(newKey) =>
                    handleChange(replaceEntryKey(entries, index, newKey))
                  }
                  attributesOptions={(key ? [key] : []).concat(
                    attributesOptions,
                  )}
                />
              </td>
              <td className={CS.pb1} style={{ verticalAlign: "top" }}>
                <Button
                  leftSection={<Icon name="close" />}
                  variant="subtle"
                  onClick={() => handleChange(removeEntry(entries, index))}
                  color={"text"}
                  data-testid="remove-mapping"
                />
              </td>
            </tr>
          );
        })}
        {_.every(entries, (entry) => entry.value !== "" && entry.key !== "") &&
          attributesOptions.length > 0 && (
            <tr>
              <td colSpan={2}>
                <Button
                  leftSection={<Icon name="add" />}
                  variant="subtle"
                  onClick={() => handleChange(addEntry(entries))}
                >
                  {t`Add a filter`}
                </Button>
              </td>
            </tr>
          )}
      </tbody>
    </table>
  );
};

interface AttributePickerProps {
  value: string;
  onChange?: (value: string) => void;
  attributesOptions: UserAttributeKey[];
}

const AttributePicker = ({
  value,
  onChange,
  attributesOptions,
}: AttributePickerProps) => {
  return (
    <Select
      miw={200}
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
  );
};

const ColumnPicker = ({
  value,
  onChange,
  policyTable,
  policy,
  shouldUseSavedQuestion,
}: {
  value: string;
  onChange?: (value: string) => void;
  policyTable?: Table;
  policy: GroupTableAccessPolicy | GroupTableAccessPolicyDraft;
  shouldUseSavedQuestion: boolean;
}) => {
  const filterByTableColumn =
    !shouldUseSavedQuestion && policy.table_id != null;
  const filterBySavedQuestion =
    shouldUseSavedQuestion && policy.card_id != null;

  if (filterByTableColumn || filterBySavedQuestion) {
    return (
      <Box miw={200}>
        <QuestionParameterTargetWidget
          target={value}
          onChange={onChange}
          questionObject={
            filterByTableColumn && policyTable
              ? getRawDataQuestionForTable(policyTable)
              : null
          }
          questionId={filterBySavedQuestion ? policy.card_id : undefined}
          placeholder={
            filterByTableColumn ? t`Pick a column` : t`Pick a parameter`
          }
        />
      </Box>
    );
  }

  // no question or table selected
  return null;
};
