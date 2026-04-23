import { t } from "ttag";

import { Box, TextInput } from "metabase/ui";

import {
  DEFAULT_USER_EMAIL,
  DEFAULT_USER_PASSWORD,
} from "../../../../constants";

export function CredentialsSection() {
  return (
    <>
      <Box p="md">
        {t`Sign in to the development instance with the following default credentials:`}
      </Box>
      <Box px="md" pb="md">
        <TextInput
          maw="20rem"
          label={t`Email address`}
          value={DEFAULT_USER_EMAIL}
          readOnly
        />
        <TextInput
          maw="20rem"
          mt="sm"
          label={t`Password`}
          value={DEFAULT_USER_PASSWORD}
          readOnly
        />
      </Box>
    </>
  );
}
