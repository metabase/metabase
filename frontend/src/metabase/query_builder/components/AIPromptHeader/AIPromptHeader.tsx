import React from "react";
import { t } from "ttag";
import AIPrompt from "metabase/components/AIPrompt/AIPrompt";
import {
  AIMetabotLogo,
  AIMetabotSection,
  AIPromptHeaderRoot,
  MetabotReply,
} from "./AIPromptHeader.styled";
import { User } from "metabase-types/api";

interface AIPromptHeaderProps {
  user: User;
}

const AIPromptHeader = ({ user }: AIPromptHeaderProps) => {
  return (
    <AIPromptHeaderRoot>
      <AIMetabotSection>
        <AIMetabotLogo />
        <MetabotReply>{t`What can I answer for you?`}</MetabotReply>
      </AIMetabotSection>
      <AIPrompt user={user} />
    </AIPromptHeaderRoot>
  );
};

export default AIPromptHeader;
