import { Box, Flex, Icon, type IconName, Text } from "metabase/ui";

import S from "./SectionPill.module.css";

interface Props {
  icon: IconName;
  title: string;
}

export const SectionPill = ({ icon, title }: Props) => {
  return (
    <Flex
      align="center"
      bg="bg-medium"
      className={S.sectionPill}
      display="inline-flex"
      gap="sm"
      px="sm"
      py={6}
    >
      <Box c="text-dark" flex="0 0 auto">
        <Icon name={icon} size={12} />
      </Box>

      <Text c="text-primary" size="sm">
        {title}
      </Text>
    </Flex>
  );
};
