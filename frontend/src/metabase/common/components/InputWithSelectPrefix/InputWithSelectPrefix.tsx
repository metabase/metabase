import { useMemo, useState } from "react";

import CS from "metabase/css/core/index.css";
import { Flex, Input, Select } from "metabase/ui";

import S from "./InputWithSelectPrefix.module.css";

function splitValue({
  value,
  prefixes,
  defaultPrefix,
}: {
  value: string;
  prefixes: string[];
  defaultPrefix: string;
}) {
  if (value == null) {
    return { value: "", rest: "" };
  }
  const prefix = prefixes.find((p: string) => value.startsWith(p));

  return {
    prefix: prefix || defaultPrefix,
    rest: prefix ? value.slice(prefix.length) : value,
  };
}

interface Props {
  value: string;
  prefixes: string[];
  defaultPrefix?: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
}

export function InputWithSelectPrefix({
  value,
  prefixes,
  defaultPrefix = "",
  onChange,
  placeholder = "",
}: Props) {
  const [localValue, setLocalValue] = useState(value);

  const { prefix, rest } = useMemo(
    () =>
      splitValue({
        value: localValue,
        prefixes,
        defaultPrefix,
      }),
    [localValue, prefixes, defaultPrefix],
  );

  return (
    <Flex w="400px" p={0} className={S.Border}>
      <Select
        aria-label="input-prefix"
        name="input-prefix"
        classNames={{
          root: CS.borderRight,
          input: CS.borderless,
        }}
        value={prefix || defaultPrefix}
        onChange={(val) => {
          setLocalValue(val + rest);
          onChange(val + rest);
        }}
        w="8rem"
        data={prefixes}
      />
      <Input
        type="text"
        classNames={{
          input: CS.borderless,
        }}
        w="100%"
        value={rest}
        placeholder={placeholder}
        onChange={(e) => setLocalValue(prefix + e.target.value)}
        onBlur={(e) => onChange(prefix + e.target.value)}
      />
    </Flex>
  );
}
