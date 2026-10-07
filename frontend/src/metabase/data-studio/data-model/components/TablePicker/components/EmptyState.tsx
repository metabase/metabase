import { Box, Flex, Icon, Stack } from "metabase/ui";

import S from "./EmptyState.module.css";

interface Props {
  title: string;
}

export function EmptyState({ title }: Props) {
  return (
    <Stack py="xxl" align="center" className={S.emptyState} gap="lg">
      <Flex className={S.empyIcon} p="xl" align="center" justify="center">
        <Icon name="table2" />
      </Flex>
      <Box>{title}</Box>
    </Stack>
  );
}
