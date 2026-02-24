import { useState } from "react";
import { t } from "ttag";

import { Box, Stack, Switch, Title } from "metabase/ui";

const TEST_FLAGS = {
  "test-flag-1": {
    value: false,
    description: "This is an important flag that does something really cool",
  },
  "test-flag-2": {
    value: true,
    description:
      "This is another important flag that does something really cool",
  },
  "test-flag-3": {
    value: false,
    description:
      "This is yet another important flag that does something really cool",
  },
};

export function ReleaseFlagPage() {
  const flags = TEST_FLAGS;
  return (
    <Box p="xl">
      <Title pb="xl">{t`Release Flags`}</Title>
      <Stack>
        {Object.entries(flags).map(([name, { value, description }]) => (
          <FlagSwitch
            key={name}
            name={name}
            description={description}
            value={value}
          />
        ))}
      </Stack>
    </Box>
  );
}

const FlagSwitch = ({
  name,
  value,
  description,
}: {
  name: string;
  value: boolean;
  description: string;
}) => {
  const [enabled, setEnabled] = useState(value);

  return (
    <Switch
      label={name}
      checked={enabled}
      description={description}
      onChange={() => setEnabled(!enabled)}
    />
  );
};
