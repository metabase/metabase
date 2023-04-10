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
import Tooltip from "metabase/core/components/Tooltip";
import {
  ButtonsContainer,
  ErrorRoot,
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
  const [{ loading, error }, generateQuery] = useAsyncFn(
    async (reset = false) => {
      if (reset) {
        return Promise.resolve(undefined);
      }

      const { sql } = await MetabotApi.databasePromptQuery({
        databaseId,
        question: prompt,
      });

      onQueryGenerated(sql);
    },
    [prompt],
  );

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

      {error != null ? (
        <ErrorContent
          error={(error as any)?.data?.message}
          onRerun={() => generateQuery(false)}
          onRephrase={() => generateQuery(true)}
        />
      ) : (
        <>
          <PromptInput
            autoFocus
            fullWidth
            disabled={loading}
            placeholder={t`Ask anything...`}
            value={prompt}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />

          <Tooltip tooltip={t`Close`}>
            <Button
              aria-label={t`Close prompt`}
              icon="close"
              onlyIcon
              iconSize={18}
              onClick={onClose}
            />
          </Tooltip>
        </>
      )}
    </NativeQueryEditorPromptRoot>
  );
};

export default NativeQueryEditorPrompt;

interface ErrorContentProps {
  onRephrase: () => void;
  onRerun: () => void;
  error?: string;
}

const ErrorContent = ({ error, onRephrase, onRerun }: ErrorContentProps) => {
  return (
    <ErrorRoot>
      {error ?? t`Could not generate a query`}
      <ButtonsContainer>
        <Button small onClick={onRerun}>{t`Try again`}</Button>
        <Button small onClick={onRephrase}>{t`Rephrase`}</Button>
      </ButtonsContainer>
    </ErrorRoot>
  );
};
