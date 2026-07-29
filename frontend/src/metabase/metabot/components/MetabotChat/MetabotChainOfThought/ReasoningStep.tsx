import cx from "classnames";
import { useState } from "react";

import Animation from "metabase/css/core/animation.module.css";
import { AIMarkdown } from "metabase/metabot/components/AIMarkdown";
import { Collapse, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./MetabotChainOfThought.module.css";

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
        <div className={cx(S.reasoningBody, Animation.fadeIn)}>
          <AIMarkdown isStreaming={active}>{text}</AIMarkdown>
        </div>
      </Collapse>
    </div>
  );
};
