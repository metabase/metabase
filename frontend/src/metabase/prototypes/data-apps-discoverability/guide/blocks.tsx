import type { ReactNode } from "react";

import { CopyButton } from "metabase/common/components/CopyButton";
import { Box, Code, Flex, Icon, Stack, Text } from "metabase/ui";

/** A paragraph of step copy. */
export const Prose = ({ children }: { children: ReactNode }) => (
  <Text c="text-primary" lh="1.5rem">
    {children}
  </Text>
);

/** A command or an agent prompt, with a copy button. */
export const Snippet = ({ code }: { code: string }) => (
  <Box pos="relative">
    <Code
      block
      p="md"
      pr="3rem"
      fz="sm"
      lh="1.25rem"
      style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
    >
      {code}
    </Code>
    <Box pos="absolute" top="0.75rem" right="0.75rem" lh={1}>
      <CopyButton value={code} />
    </Box>
  </Box>
);

/** The ordered things to do within one step. */
export const Substeps = ({ children }: { children: ReactNode[] }) => (
  <Stack component="ol" gap="sm" lh="1.5rem" c="text-primary">
    {children.map((child, index) => (
      <Flex component="li" key={index} gap="sm">
        <Text c="text-secondary" lh="inherit" flex="0 0 1.25rem" ta="end">
          {index + 1}.
        </Text>
        <Box flex={1} miw={0}>
          {child}
        </Box>
      </Flex>
    ))}
  </Stack>
);

/** A substep that carries a command under its sentence. */
export const SubstepWithSnippet = ({
  children,
  code,
}: {
  children: ReactNode;
  code: string;
}) => (
  <Stack gap="sm">
    <span>{children}</span>
    <Snippet code={code} />
  </Stack>
);

/** Something that bites if you miss it. */
export const Caution = ({ children }: { children: ReactNode }) => (
  <Flex
    gap="sm"
    p="md"
    bdrs="sm"
    bg="background_surface-warning"
    c="text-primary"
    lh="1.5rem"
  >
    <Icon name="warning" c="feedback-warning" mt="0.25rem" flex="0 0 auto" />
    <Text c="inherit" lh="inherit">
      {children}
    </Text>
  </Flex>
);
