import { Flex, Stack, Text, rem } from "metabase/ui";

import type { ContentDirectionType } from "./utils";

interface Props {
  type: string;

  title?: string | null;
  contentDirection?: ContentDirectionType;

  children: React.ReactNode;
}

export const ClickActionsViewSection = ({
  type,
  title,
  contentDirection = "column",
  children,
}: Props): JSX.Element => {
  const isRow = contentDirection === "row";
  const isSortRow = type === "sort" && isRow;

  const sectionContent = (
    <Flex
      data-testid={`click-actions-${type}-section`}
      direction={contentDirection}
      gap="sm"
      mb={isSortRow ? "sm" : undefined}
      ml={isSortRow ? "-sm" : undefined}
    >
      {children}
    </Flex>
  );

  if (title) {
    return (
      <Stack gap={isRow ? rem(12) : "md"} mt="sm" mb={isRow ? "sm" : undefined}>
        <Text size="sm" c="text-secondary">
          {title}
        </Text>
        {sectionContent}
      </Stack>
    );
  }

  return sectionContent;
};
