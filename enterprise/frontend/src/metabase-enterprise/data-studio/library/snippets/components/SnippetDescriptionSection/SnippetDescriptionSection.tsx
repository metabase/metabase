import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { useToast } from "metabase/common/hooks";
import type { NativeQuerySnippet } from "metabase-types/api";

type SnippetDescriptionSectionProps = {
  snippet: NativeQuerySnippet;
  isDisabled?: boolean;
};

export function SnippetDescriptionSection({
  snippet,
  isDisabled,
}: SnippetDescriptionSectionProps) {
  const [updateSnippet] = useUpdateSnippetMutation();
  const [sendToast] = useToast();

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateSnippet({
      id: snippet.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendToast({
        message: t`Failed to update snippet description`,
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`Snippet description updated`,
        icon: "check",
      });
    }
  };

  return (
    <EditableText
      initialValue={snippet.description ?? ""}
      placeholder={t`No description`}
      isMarkdown
      onChange={handleChange}
      isDisabled={isDisabled}
      isOptional
    />
  );
}
