import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useRef,
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
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { Deferred, defer } from "metabase/lib/promise";
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
  const cancelDeferred = useRef<Deferred | null>(null);
  const [{ loading, error }, generateQuery] = useAsyncFn(
    async (reset = false) => {
      cancelDeferred.current?.resolve();

      if (reset) {
        return Promise.resolve(undefined);
      }

      cancelDeferred.current = defer();

      const { sql } = await MetabotApi.databasePromptQuery(
        {
          databaseId,
          question: prompt,
        },
        { cancelled: cancelDeferred.current.promise },
      );

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

  const handleCloseClick = () => {
    if (loading) {
      generateQuery(true);
    } else {
      onClose();
    }
  };

  const closeLabel = loading ? t`Cancel` : t`Close`;

  return (
    <NativeQueryEditorPromptRoot>
      {loading ? <LoadingSpinner size={20} /> : <Icon name="insight" />}

      {error != null ? (
        <ErrorContent
          error={getResponseErrorMessage(error)}
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

          <Tooltip tooltip={closeLabel}>
            <Button
              aria-label={closeLabel}
              icon="close"
              onlyIcon
              iconSize={18}
              onClick={handleCloseClick}
            />
          </Tooltip>
        </>
      )}
    </NativeQueryEditorPromptRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
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
