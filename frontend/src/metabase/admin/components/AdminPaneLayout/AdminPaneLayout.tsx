import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Stack, Text } from "metabase/ui";

interface AdminPaneLayoutProps {
  title?: React.ReactNode;
  description?: string;
  titleActions?: ReactNode;
  headerContent?: ReactNode;
  children: ReactNode;
}

export const AdminPaneLayout = ({
  title,
  description,
  children,
  headerContent,
  titleActions,
}: AdminPaneLayoutProps) => {
  return (
    <Box data-testid="admin-panel" px="lg">
      <Stack component="section" mb="lg" gap="xl">
        {(title || description || titleActions) && (
          <Flex
            justify="space-between"
            align="flex-start"
            gap="lg"
            wrap="nowrap"
          >
            <Stack gap="lg" miw={0}>
              {title && (
                <h2 data-testid="admin-pane-page-title" className={CS.m0}>
                  {title}
                </h2>
              )}
              {description && <Text maw="40rem">{description}</Text>}
            </Stack>
            {titleActions && <Box flex="0 0 auto">{titleActions}</Box>}
          </Flex>
        )}

        <Flex w="100%" align="center" gap="xxl">
          {headerContent}
        </Flex>
      </Stack>

      {children}
    </Box>
  );
};
