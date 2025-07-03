import cx from "classnames";
import type React from "react";
import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  Button,
  type ButtonProps,
  Icon,
  TextInput,
  type TextInputProps,
  Tooltip,
} from "metabase/ui";
import type { StructuredUserAttribute } from "metabase-types/api";

type DefaultRenderInputProps = {
  value: MappingValue;
  onChange?: (val: string) => void;
  placeholder?: string;
  error?: boolean | string;
  disabled?: boolean;
} & Omit<
  TextInputProps,
  "value" | "onChange" | "placeholder" | "error" | "disabled"
>;

const DefaultRenderInput = ({
  value,
  onChange,
  placeholder,
  error = false,
  disabled = false,
  ...rest
}: DefaultRenderInputProps) => (
  <TextInput
    value={value || ""}
    placeholder={placeholder}
    onChange={(e) => onChange?.(e.target.value)}
    error={error}
    disabled={disabled}
    {...rest}
  />
);

type MappingValue = string;
type MappingType = Record<string, MappingValue>;

export interface MappingEditorProps {
  specialEntries?: MappingEditorEntry[];
  value: MappingType;
  onChange: (val: MappingType) => void;
  onError?: (val: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
  keyHeader?: JSX.Element;
  valueHeader?: JSX.Element;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  renderKeyInput?: (input: DefaultRenderInputProps) => JSX.Element;
  renderValueInput?: (input: DefaultRenderInputProps) => React.ReactNode;
  divider?: JSX.Element;
  canAdd?: boolean;
  canDelete?: boolean;
  addText?: string;
  addButtonProps?: ButtonProps;
  swapKeyAndValue?: boolean;
}

export type MappingEditorEntry = {
  key: string;
  value: string;
  keyOpts?: Omit<DefaultRenderInputProps, "value">;
  valueOpts?: Omit<DefaultRenderInputProps, "value"> & {
    revert?: StructuredUserAttribute;
  };
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

const entryError = (entries: MappingEditorEntry[], key: string) => {
  if (entries.filter((e) => e.key === key).length > 1) {
    return t`Attribute keys can't have the same name`;
  }
  if (
    entries.some(
      (e) => !e.keyOpts?.disabled && e.key === key && e.key.startsWith("@"),
    )
  ) {
    return t`Keys starting with "@" are reserved for system use`;
  }
  return false;
};

const hasError = (entries: MappingEditorEntry[]) => {
  return entries.some(({ key }) => entryError(entries, key));
};

export const MappingEditor = ({
  specialEntries = [],
  value: mapping,
  onChange,
  onError,
  className = "",
  style = {},
  keyHeader,
  valueHeader,
  keyPlaceholder = t`Key`,
  valuePlaceholder = t`Value`,
  renderKeyInput = DefaultRenderInput,
  renderValueInput = DefaultRenderInput,
  divider,
  canAdd = true,
  canDelete = true,
  addText = "Add",
  addButtonProps,
  swapKeyAndValue,
}: MappingEditorProps) => {
  const [entries, setEntries] = useState<MappingEditorEntry[]>(
    specialEntries?.length ? specialEntries : buildEntries({ ...mapping }), // FIXME
  );

  const handleChange = (newEntries: MappingEditorEntry[]) => {
    setEntries(newEntries);
    if (onError && hasError(newEntries)) {
      onError(hasError(newEntries));
    } else {
      onChange(buildMapping(newEntries));
    }
  };

  return (
    <table className={className} style={style} data-testid="mapping-editor">
      {keyHeader || valueHeader ? (
        <thead>
          <tr>
            <td>{!swapKeyAndValue ? keyHeader : valueHeader}</td>
            <td />
            <td>{!swapKeyAndValue ? valueHeader : keyHeader}</td>
          </tr>
        </thead>
      ) : null}
      <tbody>
        {entries.map(({ key, value, keyOpts, valueOpts }, index) => {
          const keyInput = renderKeyInput({
            value: key,
            placeholder: keyPlaceholder,
            ...keyOpts,
            onChange: (newKey) =>
              handleChange(replaceEntryKey(entries, index, newKey)),
            error: entryError(entries, key),
          });
          const valueInput = renderValueInput({
            value: value,
            placeholder: valuePlaceholder,
            ...valueOpts,
            onChange: (newValue) =>
              handleChange(replaceEntryValue(entries, index, newValue)),
          });

          const canDeleteThis =
            canDelete && !keyOpts?.disabled && !valueOpts?.disabled;
          const canRevert =
            !canDeleteThis &&
            valueOpts?.revert &&
            valueOpts?.revert.value !== value;

          // console.log({ canRevert, valueOpts })

          return (
            <tr key={index}>
              <td
                className={CS.pb1}
                style={{ verticalAlign: "top", width: "auto" }}
              >
                {!swapKeyAndValue ? keyInput : valueInput}
              </td>
              <td
                className={cx(CS.pb1, CS.px1)}
                style={{ verticalAlign: "middle" }}
              >
                {divider}
              </td>
              <td
                className={CS.pb1}
                style={{ verticalAlign: "top", width: "auto" }}
              >
                {!swapKeyAndValue ? valueInput : keyInput}
              </td>
              {canDeleteThis && (
                <td className={CS.pb1} style={{ verticalAlign: "top" }}>
                  <Button
                    leftSection={<Icon name="close" />}
                    variant="subtle"
                    onClick={() => handleChange(removeEntry(entries, index))}
                    color={"text"}
                    data-testid="remove-mapping"
                  />
                </td>
              )}
              {canRevert && (
                <td className={CS.pb1} style={{ verticalAlign: "top" }}>
                  <Tooltip
                    label={t`Revert to "${valueOpts?.revert?.value}" value from ${valueOpts?.revert?.source}`}
                  >
                    <Button
                      leftSection={<Icon name="refresh" />}
                      variant="subtle"
                      onClick={() =>
                        handleChange(
                          replaceEntryValue(
                            entries,
                            index,
                            valueOpts.revert?.value || "",
                          ),
                        )
                      }
                      color={"text"}
                      data-testid="revert-mapping"
                    />
                  </Tooltip>
                </td>
              )}
            </tr>
          );
        })}
        {_.every(entries, (entry) => entry.value !== "" && entry.key !== "") &&
          canAdd && (
            <tr>
              <td colSpan={2}>
                <Button
                  leftSection={<Icon name="add" />}
                  variant="subtle"
                  onClick={() => handleChange(addEntry(entries))}
                  {...addButtonProps}
                >
                  {addText}
                </Button>
              </td>
            </tr>
          )}
      </tbody>
    </table>
  );
};

const addEntry = (entries: MappingEditorEntry[]) => {
  return [...entries, { key: "", value: "" }];
};

const removeEntry = (entries: MappingEditorEntry[], index: number) => {
  const entriesCopy = [...entries];
  entriesCopy.splice(index, 1);
  return entriesCopy;
};

const replaceEntryValue = (
  entries: MappingEditorEntry[],
  index: number,
  newValue: MappingValue,
) => {
  const newEntries = [...entries];
  newEntries[index].value = newValue;
  return newEntries;
};

const replaceEntryKey = (
  entries: MappingEditorEntry[],
  index: number,
  newKey: string,
) => {
  const newEntries = [...entries];
  newEntries[index].key = newKey;
  return newEntries;
};
