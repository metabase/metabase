import { Box, Icon, Stack } from "metabase/ui";

import S from "./Error.module.css";

export function Error({ message }: { message: string }) {
  return (
    <Stack h="100%" p="xl" justify="center" align="center" color="text-light">
      <Box p="md" mt="lg" className={S.error} bg="bg-medium">
        <Icon name="warning" size={16} />
      </Box>

      <Box maw="500px">{message}</Box>
    </Stack>
  );
}
