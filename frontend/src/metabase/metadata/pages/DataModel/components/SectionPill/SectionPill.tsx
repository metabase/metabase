import { Flex, Text } from "metabase/ui";

import S from "./SectionPill.module.css";

interface Props {
  title: string;
}

export const SectionPill = ({ title }: Props) => {
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
      <Text c="text-primary" size="sm">
        {title}
      </Text>
    </Flex>
  );
};
