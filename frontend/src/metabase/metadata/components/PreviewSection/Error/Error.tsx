import { Box, Icon, Stack, rem } from "metabase/ui";

import S from "./Error.module.css";

interface Props {
  message: string;
}

export function Error({ message }: Props) {
  return (
    <Stack align="center" color="text-light" h="100%" justify="center" p="xl">
      <Box bg="bg-medium" className={S.error} mt="lg" p="md">
        <Icon name="warning" size={16} />
      </Box>

      <Box maw={rem(500)}>{message}</Box>
    </Stack>
  );
}
