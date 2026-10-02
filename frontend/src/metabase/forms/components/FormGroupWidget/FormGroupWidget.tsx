import { useField } from "formik";
import type { FocusEvent, Ref } from "react";
import { forwardRef, useCallback } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { useHasTokenFeature } from "metabase/common/hooks";
import { getAddMembersDisabledReason } from "metabase/common/utils/groups";
import type { SelectProps } from "metabase/ui";
import { DefaultSelectItem, Loader, Select, Tooltip } from "metabase/ui";
import type { GroupId } from "metabase-types/api";

interface FormGroupWidgetProps extends Omit<
  SelectProps,
  "value" | "error" | "data"
> {
  name: string;
  nullable?: boolean;
}

// single-select widget for selecting a permissions group
export const FormGroupWidget = forwardRef(function FormGroupWidget(
  { name, nullable, onChange, onBlur, ...props }: FormGroupWidgetProps,
  ref: Ref<HTMLInputElement>,
) {
  const [{ value }, { error, touched }, { setValue, setTouched }] = useField<
    GroupId | null | undefined
  >(name);
  const hasAdvancedPermissions = useHasTokenFeature("advanced_permissions");

  const handleChange = useCallback(
    (newValue: string) => {
      const newGroupId = parseInt(newValue, 10);
      setValue(newGroupId);
    },
    [setValue],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setTouched(true);
      onBlur?.(event);
    },
    [setTouched, onBlur],
  );

  const { data: groups, isLoading } = useListPermissionsGroupsQuery({});
  if (isLoading || !groups) {
    return <Loader size={16} />;
  }

  // Only a change of group is an addition; keeping the current one is not.
  const disabledReasonByValue = new Map(
    groups.map((group) => [
      String(group.id),
      group.id === value
        ? null
        : getAddMembersDisabledReason(group, hasAdvancedPermissions),
    ]),
  );

  const groupOptions = groups.map(({ id, name }) => ({
    value: String(id),
    label: name,
    disabled: disabledReasonByValue.get(String(id)) != null,
  }));

  const renderOption: SelectProps["renderOption"] = ({ option, checked }) => {
    const disabledReason = disabledReasonByValue.get(option.value) ?? null;
    return (
      <Tooltip
        label={disabledReason}
        disabled={disabledReason == null}
        position="right"
      >
        <DefaultSelectItem {...option} selected={checked} />
      </Tooltip>
    );
  };

  return (
    <Select
      placeholder={t`Select a group`}
      {...props}
      ref={ref}
      name={name}
      value={value == null ? undefined : String(value)}
      error={touched && error ? <div role="alert">{error}</div> : null}
      data={groupOptions}
      renderOption={renderOption}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});
