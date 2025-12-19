import type { ColorName } from "metabase/lib/colors/types";
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
  bg?: ColorName;
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <Box pos="absolute" bg={bg ?? "background-primary"} inset={0}>
      <Center h="100%" w="100%" mx="auto">
        <Loader data-testid="preview-loading-indicator" />
      </Center>
    </Box>
  );
};
