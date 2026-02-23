import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { formatNativeQuery } from "metabase/lib/engine";
import { useSelector } from "metabase/lib/redux";
import { language } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor/language";
import { getLearnUrl } from "metabase/selectors/settings";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Flex, Icon, Loader, Stack } from "metabase/ui";
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
    ...Lib.toJsQuery(query),
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
  return formatNativeQuery(data.query);
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
  return (
    <Box pos="relative" mt="sm">
      <CodeEditor
        lineNumbers={false}
        language={language({ engine })}
        value={value}
        className={S.code}
      />
      {enableCopy && <CopyButton value={value} className={S.copyButton} />}
    </Box>
  );
}
