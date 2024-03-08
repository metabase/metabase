import type { ReactNode } from "react";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import type { BoxProps } from "metabase/ui";
import { Box, Text } from "metabase/ui";

interface StaticEmbedSetupPaneSettingsContentSectionProps extends BoxProps {
  title?: string;
  className?: string;

  children: ReactNode;
}

export const StaticEmbedSetupPaneSettingsContentSection = ({
  className,
  title,
  children,
  ...restProps
}: StaticEmbedSetupPaneSettingsContentSectionProps): JSX.Element => {
  const sectionId = useUniqueId();
  return (
    <Box className={className} aria-labelledby={sectionId} {...restProps}>
      {title && (
        <Text mb="1rem" size="lg" id={sectionId}>
          {title}
        </Text>
      )}
      {children}
    </Box>
  );
};
