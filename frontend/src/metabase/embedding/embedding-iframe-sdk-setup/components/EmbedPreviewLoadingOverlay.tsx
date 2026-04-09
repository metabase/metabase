import { Box, Center, Loader } from "metabase/ui";

/**
 * Shows the same loader as Embed JS while the iframe is loading.
 * This prevents the white flash before the iframe loads.
 **/
export const EmbedPreviewLoadingOverlay = ({
  isVisible,
  bg,
}: {
  isVisible: boolean;
  bg?: string;
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Box
      pos="absolute"
      style={{ backgroundColor: bg ?? "var(--mb-color-background-primary)" }}
      inset={0}
    >
      <Center h="100%" w="100%" mx="auto">
        <Loader data-testid="preview-loading-indicator" />
      </Center>
    </Box>
  );
};
