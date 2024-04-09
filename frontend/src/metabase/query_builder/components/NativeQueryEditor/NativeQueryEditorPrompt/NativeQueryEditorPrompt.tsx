import type { ChangeEvent, KeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { getResponseErrorMessage } from "metabase/lib/errors";
import type { Deferred } from "metabase/lib/promise";
import { defer } from "metabase/lib/promise";
import { MetabotApi } from "metabase/services";
import { Icon } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

import {
  ButtonsContainer,
  ErrorRoot,
  NativeQueryEditorPromptRoot,
  PromptInput,
} from "./NativeQueryEditorPrompt.styled";

interface NativeQueryEditorPromptProps {
  databaseId?: DatabaseId | null;
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
