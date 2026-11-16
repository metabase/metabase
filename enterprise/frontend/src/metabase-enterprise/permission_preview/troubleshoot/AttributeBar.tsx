import { useState } from "react";
import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import { FieldValuesWidget } from "metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget";
import { Button, Group, Popover, Stack, Text, TextInput } from "metabase/ui";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterFieldInfo } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type { FieldId } from "metabase-types/api";

import { AttributeValueSelect } from "../AttributeValueSelect";
import type { AffectingAttribute, AttributeUse, PrincipalType } from "../api";

type AttributeBarProps = {
  principalType: PrincipalType;
  whoName: string;
  attributes: AffectingAttribute[];
  isLoading: boolean;
  /** The values picked for the preview; a user's replace their own in the preview only. */
  pickedValues: Record<string, string>;
  /** `null` resets the attribute to the person's own value. */
  onPick: (attribute: string, value: string | null) => void;
  /**
   * Whether the picker may load the filtered column's values itself. Off in the "View app as…" tab, where that call
   * would run as the previewed person: it offers the values the backend listed as the admin instead.
   */
  canQueryFields?: boolean;
};

/** The attributes a security rule reads for the previewed person, as chips under the band; each opens its picker. */
export function AttributeBar({
  principalType,
  whoName,
  attributes,
  isLoading,
  pickedValues,
  onPick,
  canQueryFields = true,
}: AttributeBarProps) {
  return (
    <Group
      gap="xs"
      aria-label={t`Attributes`}
      role="toolbar"
      wrap="wrap"
      mih="1.75rem"
    >
      <Text fz="sm" c="text-secondary">{t`Attributes:`}</Text>
      {!isLoading && attributes.length === 0 && (
        <Text c="text-secondary" fz="sm">
          {t`No security rule reads an attribute here.`}
        </Text>
      )}
      {attributes.map((attribute) => (
        <AttributeChip
          key={attribute.attribute}
          principalType={principalType}
          whoName={whoName}
          attribute={attribute}
          pickedValue={pickedValues[attribute.attribute]}
          canQueryFields={canQueryFields}
          onPick={(value) => onPick(attribute.attribute, value)}
        />
      ))}
    </Group>
  );
}

type AttributeChipProps = {
  principalType: PrincipalType;
  whoName: string;
  attribute: AffectingAttribute;
  pickedValue: string | undefined;
  canQueryFields: boolean;
  onPick: (value: string | null) => void;
};

function AttributeChip({
  principalType,
  whoName,
  attribute,
  pickedValue,
  canQueryFields,
  onPick,
}: AttributeChipProps) {
  const [isOpened, setIsOpened] = useState(false);
  const value = pickedValue ?? attribute.value ?? "";
  const column = attribute.uses.find((use) => use.column != null)?.column;
  const isOverridden =
    principalType === "user" &&
    pickedValue != null &&
    pickedValue !== (attribute.value ?? "");

  const handlePick = (newValue: string | null) => {
    setIsOpened(false);
    onPick(newValue);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened} position="bottom-start">
      <Popover.Target>
        <Button
          size="compact-sm"
          radius="xl"
          variant={isOverridden ? "light" : "default"}
          td={attribute.applies ? undefined : "line-through"}
          c={attribute.applies ? undefined : "text-secondary"}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          <Group gap="xs" wrap="nowrap">
            <Text fw="bold" fz="sm" c="inherit">
              {`${attribute.attribute}:`}
            </Text>
            <Text fz="sm" c="inherit">
              {value === "" ? t`No value` : value}
            </Text>
            {column != null && (
              <Text fz="xs" c="text-secondary">
                {`→ ${column}`}
              </Text>
            )}
          </Group>
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="md" maw="22rem">
        <Stack gap="sm">
          <Text fw="bold" fz="sm">
            {attribute.attribute}
          </Text>
          <AttributePicker
            attribute={attribute}
            value={value}
            canQueryFields={canQueryFields}
            onPick={handlePick}
          />
          {attribute.uses.map((use, index) => (
            <Text key={index} fz="xs" c="text-secondary">
              {getUseLabel(use)}
            </Text>
          ))}
          {!attribute.applies && (
            <Text fz="xs" c="text-secondary">
              {t`The open item doesn't use this rule.`}
            </Text>
          )}
          {principalType === "user" && (
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Text fz="xs" c="text-secondary">
                {getOwnValueLabel(whoName, attribute)}
              </Text>
              {isOverridden && (
                <Button size="compact-sm" onClick={() => handlePick(null)}>
                  {t`Reset`}
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** "Sandy Sales's value: Gizmo, from JWT": a user's own value and where it comes from. */
function getOwnValueLabel(whoName: string, attribute: AffectingAttribute) {
  const value = attribute.value ?? t`No value`;
  switch (attribute.source) {
    case "jwt":
      return t`${whoName}'s value: ${value}, from JWT`;
    case "tenant":
      return t`${whoName}'s value: ${value}, from tenant ${attribute.tenant_name ?? ""}`;
    case "admin":
      return t`${whoName}'s value: ${value}, set by an admin`;
    default:
      return t`${whoName}'s value: ${value}`;
  }
}

function getUseLabel(use: AttributeUse) {
  switch (use.kind) {
    case "sandbox":
      return t`Row security: ${use.label}`;
    case "impersonation":
      return t`Connection impersonation: ${use.label}`;
    case "routing":
      return t`Database routing: ${use.label}`;
  }
}

type AttributePickerProps = {
  attribute: AffectingAttribute;
  value: string;
  onPick: (value: string) => void;
};

/** The picker the attribute's rule calls for: the filtered column's values, the router's databases, or free text. */
function AttributePicker({
  attribute,
  value,
  canQueryFields,
  onPick,
}: AttributePickerProps & { canQueryFields: boolean }) {
  const sandboxFieldId = attribute.uses.find(
    (use) => use.kind === "sandbox" && use.field_id != null,
  )?.field_id;
  const hasListedValues =
    (attribute.member_values?.length ?? 0) > 0 ||
    (attribute.other_values?.length ?? 0) > 0;

  if (sandboxFieldId != null && canQueryFields) {
    return (
      <FieldValuePicker
        fieldId={sandboxFieldId}
        attribute={attribute}
        value={value}
        onPick={onPick}
      />
    );
  }
  if (
    attribute.uses.some((use) => use.kind === "routing") ||
    (sandboxFieldId != null && hasListedValues)
  ) {
    return (
      <AttributeValueSelect
        size="xs"
        attribute={{
          attribute: attribute.attribute,
          uses: [],
          member_values: attribute.member_values ?? [],
          other_values: attribute.other_values ?? [],
          default: attribute.value,
        }}
        value={value}
        withinPortal={false}
        onChange={onPick}
      />
    );
  }
  return (
    <TextValuePicker attribute={attribute} value={value} onPick={onPick} />
  );
}

type FieldValuePickerProps = AttributePickerProps & { fieldId: FieldId };

function FieldValuePicker({
  fieldId,
  attribute,
  value,
  onPick,
}: FieldValuePickerProps) {
  const { data: field } = useGetFieldQuery({ id: fieldId });
  const [draft, setDraft] = useState(value);
  if (field == null) {
    return null;
  }
  const fieldInfo = getParameterFieldInfo(field);
  const parameter: FieldFilterUiParameter = {
    id: `attribute-${attribute.attribute}`,
    name: attribute.attribute,
    slug: attribute.attribute,
    type: "string/=",
    fields: [fieldInfo],
  };
  const memberValues = attribute.member_values ?? [];

  return (
    <Stack gap="xs">
      <FieldValuesWidget
        parameter={parameter}
        fields={[fieldInfo]}
        value={draft === "" ? [] : [draft]}
        onChange={(values) => {
          const last = values[values.length - 1];
          setDraft(last == null ? "" : String(last));
        }}
        minWidth={280}
        maxWidth={280}
      />
      <Group justify="flex-end">
        <Button
          size="compact-sm"
          variant="filled"
          disabled={draft === value}
          onClick={() => onPick(draft)}
        >
          {t`Apply`}
        </Button>
      </Group>
      {memberValues.length > 0 && (
        <Group gap={4}>
          <Text fz="xs" c="text-secondary">{t`Members:`}</Text>
          {memberValues.map((memberValue) => (
            <Button
              key={memberValue.value}
              size="compact-sm"
              variant={memberValue.value === value ? "filled" : "default"}
              onClick={() => onPick(memberValue.value)}
            >
              {`${memberValue.value} (${memberValue.count})`}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  );
}

function TextValuePicker({ attribute, value, onPick }: AttributePickerProps) {
  const [text, setText] = useState(value);
  const commit = () => text !== value && onPick(text);

  return (
    <TextInput
      size="xs"
      aria-label={attribute.attribute}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && commit()}
      onBlur={commit}
    />
  );
}
