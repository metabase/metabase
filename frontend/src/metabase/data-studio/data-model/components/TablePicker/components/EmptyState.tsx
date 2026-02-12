import { Box, Flex, Icon, Stack } from "metabase/ui";

import S from "./EmptyState.module.css";

interface Props {
  title: string;
}

export function EmptyState({ title }: Props) {
  return (
    <Stack py="xl" align="center" className={S.emptyState} gap="md">
      <Flex className={S.empyIcon} p="lg" align="center" justify="center">
        <Icon name="table2" />
      </Flex>
      <Box>{title}</Box>
    </Stack>
  );
}
