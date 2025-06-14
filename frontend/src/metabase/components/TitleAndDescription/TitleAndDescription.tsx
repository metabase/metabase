import { memo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { Box, type BoxProps, Icon, Space, Title, Tooltip } from "metabase/ui";

const TitleAndDescriptionInner = ({
  title,
  description,
  ...boxProps
}: { title: string; description?: string | null } & BoxProps) => {
  const tc = useTranslateContent();
  return (
    <Box {...boxProps}>
      <Title
        role="heading"
        size="xl"
        component="span"
        lh="normal"
        order={2}
        textWrap="wrap"
      >
        {tc(title)}
      </Title>
      <Space component="span" mx="xs" />
      {description && (
        <Tooltip label={tc(description)} maw="22em">
          <Icon name="info" />
        </Tooltip>
      )}
    </Box>
  );
};

export const TitleAndDescription = memo(TitleAndDescriptionInner);
