import type { ReactNode } from "react";

import { Text } from "metabase/ui";

interface DisplayOptionSectionProps {
  title: string;
  children: ReactNode;
}

export const DisplayOptionSection = ({
  title,
  children,
}: DisplayOptionSectionProps) => (
  <div>
    <Text fw="bold" mb="xxs" lh="1rem">
      {title}
    </Text>
    {children}
  </div>
);
