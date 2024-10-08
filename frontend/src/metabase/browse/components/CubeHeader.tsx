
import { Flex, Group, Text, Title } from "metabase/ui";

import {
  BrowseHeader,
  BrowseSection,
} from "./BrowseContainer.styled";

interface SingleCubeProps {
  cube: any;
}

export const CubeHeader: React.FC<SingleCubeProps>  = ({cube}) => {
      const caption = cube.title;
      const subTitle = cube.description
  return (
    <BrowseHeader>
      <BrowseSection>
      <Flex
      w="100%"
      h="auto" // Adjust height if needed
      direction="column" // Changed to column
      justify="flex-start" // Align items at the start
      align="flex-start"
      gap="xs"
    >
      <Title order={1} color="text-dark">
        <Group spacing="sm">
          {caption}
        </Group>
      </Title>
      {subTitle && (
        <Text size="md" weight={500} color="text-dark" mt="xs">
          {subTitle}
        </Text>
      )}
    </Flex>
      </BrowseSection>
    </BrowseHeader>
  );
};

