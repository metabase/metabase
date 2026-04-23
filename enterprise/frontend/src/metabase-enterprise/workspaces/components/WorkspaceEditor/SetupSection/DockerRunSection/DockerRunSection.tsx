import { jt } from "ttag";

import { Box, Code } from "metabase/ui";

import {
  DOCKER_RUN_COMMAND,
  PREMIUM_EMBEDDING_TOKEN_ENV,
} from "../../../../constants";

export function DockerRunSection() {
  const token = <Code key="token">{PREMIUM_EMBEDDING_TOKEN_ENV}</Code>;

  return (
    <>
      <Box p="md" pb="0">
        {jt`Export your license token as ${token} in your shell, then run the command below from the directory where you saved the downloaded files.`}
      </Box>
      <Code block p="md" m="md" mt="sm">
        {DOCKER_RUN_COMMAND}
      </Code>
    </>
  );
}
