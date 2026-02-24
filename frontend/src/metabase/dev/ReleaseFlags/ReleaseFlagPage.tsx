import { t } from "ttag";

import {
  useGetReleaseFlagsQuery,
  useSetReleaseFlagMutation,
} from "metabase/api/release-flags";
import { Box, Center, Loader, Stack, Switch, Title } from "metabase/ui";
import type { ReleaseFlag } from "metabase-types/api";

export function ReleaseFlagPage() {
  const { data: flags, isLoading } = useGetReleaseFlagsQuery();

  if (isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!flags) {
    return (
      <Box p="xl">
        <Title pb="xl">{t`Release Flags`}</Title>
        <p>{t`No release flags found.`}</p>
      </Box>
    );
  }

  const flagList: { name: ReleaseFlag; description: string; value: boolean }[] =
    Object.entries(flags).map(([name, { is_enabled, description }]) => ({
      name: name as ReleaseFlag,
      description,
      value: is_enabled,
    }));

  return (
    <Box p="xl">
      <Title pb="xl">{t`Release Flags`}</Title>
      <Stack>
        {flagList.map(({ name, description, value }) => (
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
  name: ReleaseFlag;
  value: boolean;
  description: string;
}) => {
  const [updateFlag] = useSetReleaseFlagMutation();

  return (
    <Switch
      label={name}
      checked={value}
      description={description}
      onChange={() => updateFlag({ [name]: !value })}
    />
  );
};
