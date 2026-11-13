import { useState } from "react";
import { t } from "ttag";

import { useGetFieldQuery } from "metabase/api";
import { FieldValuesWidget } from "metabase/parameters/components/widgets/ParameterFieldWidget/FieldValuesWidget";
import {
  Box,
  Button,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { getParameterFieldInfo } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type { FieldId } from "metabase-types/api";

import { AttributeValueSelect } from "../AttributeValueSelect";
import type { AffectingAttribute, AttributeUse, PrincipalType } from "../api";

type AttributesPanelProps = {
  principalType: PrincipalType;
  whoName: string;
  attributes: AffectingAttribute[];
  /** Whether an item is open, so the attributes are narrowed to it. */
  isNarrowed: boolean;
  isLoading: boolean;
  /** A group's or tenant's picked values; a user's are their own and can't be changed. */
  pickedValues: Record<string, string>;
  onPick: (attribute: string, value: string) => void;
};

/** The attributes a security rule reads for the previewed person, each with its rule; values to try for a group or tenant. */
export function AttributesPanel({
  principalType,
  whoName,
  attributes,
  isNarrowed,
  isLoading,
  pickedValues,
  onPick,
}: AttributesPanelProps) {
  const canPick = principalType !== "user";

  return (
    <Stack gap="sm" p="md" bg="background_page-secondary">
      <Text fw="bold" fz="sm">
        {getTitle({ principalType, whoName, isNarrowed })}
      </Text>
      {!isLoading && attributes.length === 0 && (
        <Text c="text-secondary" fz="sm">
          {t`No security rule reads an attribute here.`}
        </Text>
      )}
      {attributes.map((attribute) => (
        <AttributeRow
          key={attribute.attribute}
          attribute={attribute}
          canPick={canPick}
          value={pickedValues[attribute.attribute] ?? attribute.value ?? ""}
          onPick={(value) => onPick(attribute.attribute, value)}
        />
      ))}
    </Stack>
  );
}

function getTitle({
  principalType,
  whoName,
  isNarrowed,
}: {
  principalType: PrincipalType;
  whoName: string;
  isNarrowed: boolean;
}) {
  if (principalType !== "user") {
    return isNarrowed
      ? t`Values to try behind this item`
      : t`Values to try for ${whoName}`;
  }
  return isNarrowed
    ? t`Attributes behind this item`
    : t`Attributes that affect ${whoName}`;
}

type AttributeRowProps = {
  attribute: AffectingAttribute;
  canPick: boolean;
  value: string;
  onPick: (value: string) => void;
};

function AttributeRow({
  attribute,
  canPick,
  value,
  onPick,
}: AttributeRowProps) {
  const textDecoration = attribute.applies ? undefined : "line-through";

  return (
    <Box c={attribute.applies ? undefined : "text-secondary"}>
      <Group gap="xs" wrap="nowrap" align="baseline" td={textDecoration}>
        <Text fw="bold" fz="sm" c="inherit" style={{ flexShrink: 0 }}>
          {attribute.attribute}
        </Text>
        {!canPick && (
          <Tooltip label={value} disabled={value === ""}>
            <Text fz="sm" c="inherit" truncate="end" miw={0}>
              {value === "" ? t`No value` : value}
            </Text>
          </Tooltip>
        )}
      </Group>
      {canPick && (
        <Box my="xs">
          <AttributePicker
            attribute={attribute}
            value={value}
            onPick={onPick}
          />
        </Box>
      )}
      {attribute.uses.map((use, index) => (
        <Text key={index} fz="xs" c="text-secondary" td={textDecoration}>
          {getUseLabel(use)}
        </Text>
      ))}
    </Box>
  );
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
function AttributePicker({ attribute, value, onPick }: AttributePickerProps) {
  const sandboxFieldId = attribute.uses.find(
    (use) => use.kind === "sandbox" && use.field_id != null,
  )?.field_id;

  if (sandboxFieldId != null) {
    return (
      <FieldValuePicker
        fieldId={sandboxFieldId}
        attribute={attribute}
        value={value}
        onPick={onPick}
      />
    );
  }
  if (attribute.uses.some((use) => use.kind === "routing")) {
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
  const [isOpened, setIsOpened] = useState(false);
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

  const handleApply = () => {
    setIsOpened(false);
    if (draft !== value) {
      onPick(draft);
    }
  };

  return (
    <Stack gap="xs">
      <Popover opened={isOpened} onChange={setIsOpened} position="right-start">
        <Popover.Target>
          <Button
            size="compact-sm"
            justify="space-between"
            rightSection={<Icon name="chevrondown" size={12} />}
            maw="100%"
            onClick={() => {
              setDraft(value);
              setIsOpened((opened) => !opened);
            }}
          >
            <Text fz="sm" truncate="end" c="inherit">
              {value === "" ? t`No value` : value}
            </Text>
          </Button>
        </Popover.Target>
        <Popover.Dropdown p="sm">
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
          <Group justify="flex-end" mt="sm">
            <Button size="compact-sm" variant="filled" onClick={handleApply}>
              {t`Apply`}
            </Button>
          </Group>
        </Popover.Dropdown>
      </Popover>
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
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && commit()}
    />
  );
}
