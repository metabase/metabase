import React from "react";
import { t } from "ttag";
import AIPrompt from "metabase/components/AIPrompt/AIPrompt";
import { Card, User } from "metabase-types/api";
import {
  AIMetabotLogo,
  AIMetabotSection,
  AIPromptHeaderRoot,
  MetabotReply,
} from "./AIPromptHeader.styled";

interface AIPromptHeaderProps {
  user: User;
  onRun: (prompt: string) => void;
  onCancel: () => void;
  model?: Card;
}

const AIPromptHeader = ({
  user,
  model,
  onRun,
  onCancel,
}: AIPromptHeaderProps) => {
  const metabotReply =
    model == null
      ? t`What can I answer for you?`
      : t`What do you want to know about ${model.name}, ${user.first_name}?`;

  return (
    <AIPromptHeaderRoot>
      <AIMetabotSection>
        <AIMetabotLogo />
        <MetabotReply>{metabotReply}</MetabotReply>
      </AIMetabotSection>
      <AIPrompt user={user} onRun={onRun} onCancel={onCancel} />
    </AIPromptHeaderRoot>
  );
};

export default AIPromptHeader;
