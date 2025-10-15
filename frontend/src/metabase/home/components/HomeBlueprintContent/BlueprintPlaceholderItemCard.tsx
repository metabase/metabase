import { Box, Skeleton } from "metabase/ui";

export const BlueprintPlaceholderItemCard = ({
  isLoading,
}: {
  isLoading?: boolean;
}) => {
  if (isLoading) {
    return (
      <Skeleton
        w="100%"
        bdrs="12px"
        h="70px"
        bg="bg-white"
        style={{
          border: "1px solid var(--mb-color-border)",
        }}
      />
    );
  }

  return (
    <Box
      w="100%"
      bdrs="12px"
      h="70px"
      bg="rgba(7, 23, 34, 0.02)"
      style={{
        border: "1px solid var(--mb-color-border)",
      }}
    />
  );
};
