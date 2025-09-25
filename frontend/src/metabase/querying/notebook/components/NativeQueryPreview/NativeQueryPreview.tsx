import { useCallback, useRef, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import ExternalLink from "metabase/common/components/ExternalLink";
import { formatNativeQuery } from "metabase/lib/engine";
import { useSelector } from "metabase/lib/redux";
import { language } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/language";
import { getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Loader,
  Stack,
  Tooltip,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { NativeDatasetResponse } from "metabase-types/api";

import S from "./NativeQueryPreview.module.css";

export function NativeQueryPreview({
  query,
  parameters = [],
}: {
  query: Lib.Query;
  parameters?: UiParameter[];
}) {
  const { data, error, isFetching } = useGetNativeDatasetQuery({
    ...Lib.toLegacyQuery(query),
    parameters,
  });

  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  const learnUrl = getLearnUrl(
    "grow-your-data-skills/learn-sql/debugging-sql/sql-syntax",
  );

  const engine = Lib.engine(query);
  const formattedQuery = getFormattedQuery(data, engine);
  const formattedError = error ? getErrorMessage(error) : undefined;

  return (
    <Stack>
      {formattedError && (
        <Flex gap="sm">
          <Icon name="warning" c="error" />
          {t`An error occurred in your query`}
        </Flex>
      )}

      {isFetching ? (
        <Flex direction="column" justify="center" align="center">
          <Loader c="brand" />
        </Flex>
      ) : (
        <Flex direction="column" mih={0}>
          <NativeCodePanel
            value={formattedError ?? formattedQuery ?? ""}
            engine={engine}
            enableCopy={formattedQuery !== undefined}
          />
        </Flex>
      )}

      {formattedError && showMetabaseLinks && (
        <Flex justify="end" mt="lg">
          <ExternalLink className={S.ModalExternalLink} href={learnUrl}>
            {t`Learn how to debug SQL errors`}
          </ExternalLink>
        </Flex>
      )}
    </Stack>
  );
}

function getFormattedQuery(
  data: NativeDatasetResponse | undefined,
  engine: string | null,
) {
  if (data == null) {
    return null;
  }
  if (engine === null) {
    return data.query;
  }
  return formatNativeQuery(data.query, engine);
}

function NativeCodePanel({
  value,
  engine,
  enableCopy,
}: {
  value: string;
  engine?: string | null;
  enableCopy?: boolean;
}) {
  const { copy, isCopied } = useCopyButton(value);

  return (
    <Box pos="relative" mt="sm">
      <CodeEditor
        lineNumbers={false}
        language={language({ engine })}
        value={value}
        className={S.code}
      />
      {enableCopy && (
        <Tooltip label={t`Copied!`} opened={isCopied}>
          <ActionIcon onClick={copy} pos="absolute" top="0" right="0" m="xs">
            <Icon name="copy" />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
}

function useCopyButton(value: string) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const copy = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    navigator.clipboard.writeText(value);
    setIsCopied(true);
    timeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
  }, [value]);

  useUnmount(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  });

  return { isCopied, copy };
}
