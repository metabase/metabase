import { Box, Icon, Stack, rem } from "metabase/ui";

import S from "./Error.module.css";

interface Props {
  message: string;
}

export function Error({ message }: Props) {
  return (
    <Stack
      align="center"
      color="text-disabled"
      h="100%"
      justify="center"
      p="xxl"
    >
      <Box bg="background_page-tertiary" className={S.error} mt="xl" p="lg">
        <Icon name="warning" size={16} />
      </Box>

      <Box maw={rem(500)}>{message}</Box>
    </Stack>
  );
}
