import React, { useCallback, useMemo } from "react";
import PropTypes from "prop-types";
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
  users: PropTypes.array.isRequired,
  onChange: PropTypes.func,
};

const UserPicker = ({ value, users, onChange }) => {
  const options = useMemo(() => {
    return users.map(user => ({ label: user.common_name, value: user }));
  }, [users]);

  const valueRenderer = useCallback(value => {
    return value.common_name || value.email;
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
    if (MetabaseUtils.isEmail(text)) {
      return { email: text };
    }
  }, []);

  return (
    <UserPickerRoot>
      <TokenField
        value={value}
        valueRenderer={valueRenderer}
        options={options}
        optionRenderer={optionRenderer}
        filterOption={filterOption}
        parseFreeformValue={parseFreeformValue}
        multi={true}
        onChange={onChange}
      />
    </UserPickerRoot>
  );
};

const includesIgnoreCase = (s1, s2) => {
  return s1.toLowerCase().includes(s2.toLowerCase());
};

UserPicker.propTypes = propTypes;

export default UserPicker;
