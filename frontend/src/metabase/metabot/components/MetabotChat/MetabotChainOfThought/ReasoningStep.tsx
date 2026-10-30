import cx from "classnames";
import { useState } from "react";

import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import { useReasoningVisibility } from "metabase/metabot/utils/reasoning-visibility";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";

export const ReasoningStep = ({
  conversationId,
  text,
  label,
  active,
  shown,
}: {
  conversationId: string;
  text: string;
  label: string;
  active: boolean;
  // Whether the chain of thought around this step is open.
  shown: boolean;
}) => {
  const [open, setOpen] = useState(false);
  // The stream paces reasoning only while the user can read it.
  useReasoningVisibility(conversationId, shown && open && active);

  return (
    <div className={S.toolStep}>
      <UnstyledButton
        className={S.toolRow}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Text component="span" c="inherit" lh="inherit">
          {label}
        </Text>
        <Icon
          name="chevronright"
          size={10}
          className={cx(S.chevron, open && S.chevronOpen)}
        />
      </UnstyledButton>
      <Collapse in={open}>
        <div className={cx(S.reasoningBody, S.nested, Animation.fadeIn)}>
          <AIMarkdown isStreaming={active}>{text}</AIMarkdown>
        </div>
      </Collapse>
    </div>
  );
};
