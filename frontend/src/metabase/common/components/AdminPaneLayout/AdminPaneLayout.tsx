import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import { Flex, Stack, Text } from "metabase/ui";

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
    <div data-testid="admin-panel">
      <Stack component="section" px="md" mb="xl" gap="lg">
        {(title || description || titleActions) && (
          <Flex
            justify="space-between"
            align="flex-start"
            gap="md"
            wrap="nowrap"
          >
            <Stack gap="md">
              {title && (
                <h2 data-testid="admin-pane-page-title" className={CS.m0}>
                  {title}
                </h2>
              )}
              {description && <Text maw="40rem">{description}</Text>}
            </Stack>
            {titleActions}
          </Flex>
        )}

        <Flex w="100%" align="center" gap="xl">
          {headerContent}
        </Flex>
      </Stack>

      {children}
    </div>
  );
};
