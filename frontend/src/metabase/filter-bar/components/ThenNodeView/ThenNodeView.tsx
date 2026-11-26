import { NodeViewWrapper } from "@tiptap/react";
import { t } from "ttag";

import { Text } from "metabase/ui";

export const ThenNodeView = () => (
  <NodeViewWrapper as="span">
    <Text component="span" c="text-secondary" fz="xs" fs="italic">
      {t`then`}
    </Text>
  </NodeViewWrapper>
);
