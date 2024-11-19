import PropTypes from "prop-types";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import TokenField from "metabase/components/TokenField";
import { isEmail } from "metabase/lib/email";

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
    return users.map(user => ({ value: user }));
  }, [users]);

  const idKey = useCallback(value => {
    return value.id || value.email;
  }, []);

  const valueRenderer = useCallback(value => {
    return value.common_name;
  }, []);

  const optionRenderer = useCallback(option => {
    return (
      <UserPickerOption>
        <UserPickerAvatar user={option.value} />
        <UserPickerText>{option.value.common_name}</UserPickerText>
      </UserPickerOption>
    );
  }, []);

  const filterOption = useCallback((option, text) => {
    return (
      includesIgnoreCase(option.value.common_name, text) ||
      includesIgnoreCase(option.value.email, text)
    );
  }, []);

  const parseFreeformValue = useCallback(text => {
    if (isEmail(text)) {
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
