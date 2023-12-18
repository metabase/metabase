import type { ReactNode } from "react";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { Box, Text } from "metabase/ui";

interface EmbeddingModalContentSectionProps {
  title?: string;
  className?: string;

  children: ReactNode;
}

export const EmbeddingModalContentSection = ({
  className,
  title,
  children,
}: EmbeddingModalContentSectionProps): JSX.Element => {
  const sectionId = useUniqueId();
  return (
    <Box className={className} aria-labelledby={sectionId}>
      {title && (
        <Text mb="1rem" size="lg" id={sectionId}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
};
