import cx from "classnames";
import { useState } from "react";

import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";

// reasoning is tucked away behind a duration-based collapse ("Thought briefly", or
// the exact seconds once it runs long) and stays collapsed by default; active only
// drives the reasoning text streaming.
export const ReasoningStep = ({
  text,
  label,
  active,
}: {
  text: string;
  label: string;
  active: boolean;
}) => {
  const [open, setOpen] = useState(false);

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
        <div className={S.reasoningBody}>
          <AIMarkdown isStreaming={active} animateFromStart>
            {text}
          </AIMarkdown>
        </div>
      </Collapse>
    </div>
  );
};
