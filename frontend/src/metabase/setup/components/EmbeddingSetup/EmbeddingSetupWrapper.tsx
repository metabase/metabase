import { Box } from "metabase/ui";

import { EmbeddingSetupProvider } from "./EmbeddingSetupContext";

type EmbeddingSetupWrapperProps = {
  children: React.ReactNode;
};

export const EmbeddingSetupWrapper = ({
  children,
}: EmbeddingSetupWrapperProps) => {
  return (
    <EmbeddingSetupProvider>
      <Box p="xl" maw={800} mx="auto">
        {children}
      </Box>
    </EmbeddingSetupProvider>
  );
};
