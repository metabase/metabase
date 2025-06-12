import { memo } from "react";

import { Box, type BoxProps, Icon, Space, Title, Tooltip } from "metabase/ui";

const TitleAndDescriptionInner = ({
  title,
  description,
  ...boxProps
}: { title: string; description?: string | null } & BoxProps) => (
  <Box {...boxProps}>
    <Title role="header" component="span" order={3} textWrap="wrap">
      {title}
    </Title>
    <Space component="span" mx="xs" />
    {description && (
      <Tooltip label={description} maw="22em">
        <Icon name="info" />
      </Tooltip>
    )}
  </Box>
);

export const TitleAndDescription = memo(TitleAndDescriptionInner);
