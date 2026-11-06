import type { ReactNode } from "react";

import { Center, Text, rem } from "metabase/ui";

/**
 * A list's empty state: a well the size and shape of one of its cards, so the
 * section keeps its shape until something fills it.
 */
export function ListEmptyItem({ children }: { children: ReactNode }) {
  return (
    <Center
      bg="background_page-secondary"
      bdrs="lg"
      px="lg"
      py={rem(12)}
      // A card with a name and a description line
      mih={rem(72)}
    >
      <Text c="text-secondary" ta="center">
        {children}
      </Text>
    </Center>
  );
}
