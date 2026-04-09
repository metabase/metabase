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
      direction={contentDirection}
      gap="sm"
      align={isRow ? undefined : "stretch"}
      mb={isSortRow ? "sm" : undefined}
      ml={isSortRow ? "-sm" : undefined}
    >
      {children}
    </Flex>
  );

  if (title) {
    return (
      <Stack
        align="stretch"
        gap={isRow ? rem(12) : "md"}
        my={isRow ? "sm" : undefined}
        mt={isRow ? undefined : "sm"}
      >
        <Text size="sm" c="text-secondary">
          {title}
        </Text>
        {sectionContent}
      </Stack>
    );
  }

  return sectionContent;
};
