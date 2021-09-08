import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import Select, { Option } from "metabase/components/Select";
import { CacheTTLField } from "../CacheTTLField";
import {
  CacheFieldContainer,
  FieldContainer,
} from "./DatabaseCacheTTLField.styled";

const MODE = {
  INSTANCE_DEFAULT: "instance-default",
  CUSTOM: "custom",
};

const INSTANCE_DEFAULT_CACHE_TTL = null;
const DEFAULT_CUSTOM_CACHE_TTL = 24; // hours

const propTypes = {
  field: PropTypes.object.isRequired,
};

export function DatabaseCacheTTLField({ field }) {
  const [mode, setMode] = useState(
    field.value > 0 ? MODE.CUSTOM : MODE.INSTANCE_DEFAULT,
  );

  const onModeChange = useCallback(e => {
    setMode(e.target.value);
  }, []);

  useEffect(() => {
    if (mode === MODE.INSTANCE_DEFAULT) {
      field.onChange(INSTANCE_DEFAULT_CACHE_TTL);
    } else if (field.value == null) {
      field.onChange(DEFAULT_CUSTOM_CACHE_TTL);
    }
  }, [field, mode]);

  return (
    <FieldContainer>
      <Select value={mode} onChange={onModeChange}>
        <Option value={MODE.INSTANCE_DEFAULT}>
          Use instance default (TTL)
        </Option>
        <Option value={MODE.CUSTOM}>Custom</Option>
      </Select>
      {mode === MODE.CUSTOM && (
        <CacheFieldContainer>
          <CacheTTLField field={field} />
        </CacheFieldContainer>
      )}
    </FieldContainer>
  );
}

DatabaseCacheTTLField.propTypes = propTypes;
