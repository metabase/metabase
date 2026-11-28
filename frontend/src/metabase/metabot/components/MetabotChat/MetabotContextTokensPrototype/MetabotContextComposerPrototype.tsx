// PROTOTYPE: metabot context tokens — renders one composer variant at a time
// behind the floating picker (1–3 / ←→ to switch, R to replay).
import type { ComponentType } from "react";

import { AttachmentsComposer } from "./AttachmentsComposer";
import { CardsComposer } from "./CardsComposer";
import type { ContextComposerProps } from "./ContextComposerParts";
import { ProtoPicker, useProtoPicker } from "./ProtoPicker";
import { ToolbarComposer } from "./ToolbarComposer";

const VARIANTS: {
  name: string;
  Composer: ComponentType<ContextComposerProps>;
}[] = [
  { name: "Cards", Composer: CardsComposer },
  { name: "Toolbar", Composer: ToolbarComposer },
  { name: "Attachments", Composer: AttachmentsComposer },
];

const VARIANT_NAMES = VARIANTS.map(({ name }) => name);

export function MetabotContextComposerPrototype(props: ContextComposerProps) {
  const { activeIndex, mountKey, select, replay } = useProtoPicker(
    VARIANTS.length,
  );
  const { Composer } = VARIANTS[activeIndex] ?? VARIANTS[0];

  return (
    <>
      <Composer key={mountKey} {...props} />
      <ProtoPicker
        names={VARIANT_NAMES}
        activeIndex={activeIndex}
        onSelect={select}
        onReplay={replay}
      />
    </>
  );
}
