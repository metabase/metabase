import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useState,
} from "react";
import { t } from "ttag";
import { useAsyncFn } from "react-use";
import Icon from "metabase/components/Icon";
import Button from "metabase/core/components/Button";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import { DatabaseId } from "metabase-types/api";
import { MetabotApi } from "metabase/services";
import {
  NativeQueryEditorPromptRoot,
  PromptInput,
} from "./NativeQueryEditorPrompt.styled";

interface NativeQueryEditorPromptProps {
  databaseId: DatabaseId;
  onQueryGenerated: (queryText: string) => void;
  onClose: () => void;
}

const NativeQueryEditorPrompt = ({
  databaseId,
  onQueryGenerated,
  onClose,
}: NativeQueryEditorPromptProps) => {
  const [prompt, setPrompt] = useState("");
  const [{ loading }, generateQuery] = useAsyncFn(async () => {
    const queryText = await MetabotApi.databasePromptQuery({
      databaseId,
      question: prompt,
    });

    onQueryGenerated(queryText);
  }, [prompt]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setPrompt(event.target.value),
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        generateQuery();
      }
    },
    [generateQuery],
  );

  return (
    <NativeQueryEditorPromptRoot>
      {loading ? <LoadingSpinner size={20} /> : <Icon name="insight" />}

      <PromptInput
        autoFocus
        fullWidth
        disabled={loading}
        placeholder={t`Ask anything...`}
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />

      <Button icon="close" onlyIcon iconSize={18} onClick={onClose} />
    </NativeQueryEditorPromptRoot>
  );
};

export default NativeQueryEditorPrompt;
