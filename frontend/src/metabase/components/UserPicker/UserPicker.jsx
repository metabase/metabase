import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import TokenField from "metabase/components/TokenField";
import MetabaseUtils from "metabase/lib/utils";
import {
  UserPickerAvatar,
  UserPickerOption,
  UserPickerRoot,
  UserPickerText,
} from "./UserPicker.styled";

const propTypes = {
  value: PropTypes.array.isRequired,
  validateValue: PropTypes.func,
  users: PropTypes.array.isRequired,
  onChange: PropTypes.func,
  canAddItems: PropTypes.bool,
};

const UserPicker = ({ value, validateValue, users, canAddItems, onChange }) => {
  const placeholder = !value.length
    ? t`Enter user names or email addresses`
    : null;

  const options = useMemo(() => {
    // `label` here isn't really used because we specify `filterOption`.
    // Normally, `options` will be filtered by its `label` if we don't provide
    // `filterOption` to <TokenField />.
    return users.map(user => ({ value: user }));
  }, [users]);

  const idKey = useCallback(value => {
    return value.id || value.email;
  }, []);

  const valueRenderer = useCallback(value => {
    // https://user-images.githubusercontent.com/1937582/172158045-802e7600-531d-4dd8-86f9-b4bd4dc936aa.png
    return value.common_name;
  }, []);

  const optionRenderer = useCallback(option => {
    return (
      <UserPickerOption>
        {/* XXX: What should we display in an avatar when there's no name? */}
        <UserPickerAvatar user={option.value} />
        {/* https://user-images.githubusercontent.com/1937582/172158045-802e7600-531d-4dd8-86f9-b4bd4dc936aa.png */}
        <UserPickerText>{option.value.common_name}</UserPickerText>
      </UserPickerOption>
    );
  }, []);

  const filterOption = useCallback((option, text) => {
    // Just a note, but I think logic that filter options by either common_name or email might already work.
    return (
      includesIgnoreCase(option.value.common_name, text) ||
      includesIgnoreCase(option.value.email, text)
    );
  }, []);

  const parseFreeformValue = useCallback(text => {
    if (MetabaseUtils.isEmail(text)) {
      return { email: text };
    }
  }, []);

  return (
    <UserPickerRoot>
      <TokenField
        idKey={idKey}
        value={value}
        validateValue={validateValue}
        valueRenderer={valueRenderer}
        options={options}
        optionRenderer={optionRenderer}
        filterOption={filterOption}
        parseFreeformValue={parseFreeformValue}
        placeholder={placeholder}
        multi
        updateOnInputBlur
        onChange={onChange}
        canAddItems={canAddItems}
      />
    </UserPickerRoot>
  );
};

const includesIgnoreCase = (sourceText, searchText) => {
  return sourceText.toLowerCase().includes(searchText.toLowerCase());
};

UserPicker.propTypes = propTypes;

export default UserPicker;
