import { Flex, Text } from "metabase/ui";

interface IllustrationDescriptionProps {
  title: string;
  errorMessageContainerId: string;
}

export function IllustrationTitle({
  title,
  errorMessageContainerId,
}: IllustrationDescriptionProps) {
  return (
    <Text fw="bold" transform="none">
      <Flex align="center">
        {title}
        <Text
          ml="sm"
          color="error"
          aria-hidden
          id={errorMessageContainerId}
        ></Text>
      </Flex>
    </Text>
  );
}
