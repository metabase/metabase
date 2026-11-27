import { NodeViewWrapper } from "@tiptap/react";
import { t } from "ttag";

import { PillPart } from "../PillPart/PillPart";

export const RangeAndNodeView = () => (
  <NodeViewWrapper as="span">
    <PillPart variant="operator">{t`and`}</PillPart>
  </NodeViewWrapper>
);
