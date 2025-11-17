import { Flex, Stack } from "metabase/ui";
import { BlueprintPlaceholderItemCard } from "./BlueprintPlaceholderItemCard";

export const PlaceholderCardGrid = ({ isLoading }: { isLoading?: boolean }) => {
  const placeholderCard = (
    <BlueprintPlaceholderItemCard isLoading={isLoading} />
  );
  return (
    <Stack gap="md" pt="md">
      <Flex gap="md">
        {placeholderCard}
        {placeholderCard}
        {placeholderCard}
      </Flex>
      <Flex gap="md">
        {placeholderCard}
        {placeholderCard}
        {placeholderCard}
      </Flex>
    </Stack>
  );
};
