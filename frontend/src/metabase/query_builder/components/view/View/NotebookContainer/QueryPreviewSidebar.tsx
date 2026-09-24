import { useState } from "react";
import { t } from "ttag";

import { useGetNativeDatasetQuery } from "metabase/api";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { getEngineNativeType } from "metabase/databases/utils/engine";
import { LiveDot } from "metabase/querying/notebook/components/NodeBuilder/components/LiveDot";
import { useSelector } from "metabase/redux";
import { Box, Flex, Tabs, Text } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { getQuestion } from "../../../../store/selectors";

import { NotebookNativePreview } from "./NotebookNativePreview";
import S from "./QueryPreviewSidebar.module.css";

type PreviewTab = "native" | "mbql";

export const QueryPreviewSidebar = () => {
  const question = checkNotNull(useSelector(getQuestion));
  const [tab, setTab] = useState<PreviewTab>("mbql");

  const query = question.query();
  const canRun = Lib.canRun(query, question.type());
  const engineType = getEngineNativeType(question.database()?.engine);
  const nativeLabel = engineType === "sql" ? t`SQL` : t`Native query`;
  const mbql = JSON.stringify(Lib.toLegacyQuery(query), null, 2);
  // Same request the native preview below makes, so it is served from cache.
  const { data: nativeData } = useGetNativeDatasetQuery(Lib.toJsQuery(query));
  const copyValue = tab === "mbql" ? mbql : (nativeData?.query ?? "");
  const hint = t`Wire a table into the result to see the query.`;

  return (
    <Box
      component="aside"
      className={S.root}
      data-testid="query-preview-sidebar"
    >
      <Flex align="center" gap="sm" px="lg" pt="lg" pb="sm">
        <Text fw={700} fz="lg">
          {t`Query preview`}
        </Text>
        <LiveDot />
        {canRun && copyValue !== "" && (
          <CopyButton
            value={copyValue}
            aria-label={tab === "mbql" ? t`Copy MBQL` : t`Copy query`}
            style={{ marginLeft: "auto", display: "flex" }}
          />
        )}
      </Flex>
      <Tabs
        value={tab}
        className={S.tabs}
        onChange={(value) => setTab(value === "mbql" ? "mbql" : "native")}
      >
        <Tabs.List px="lg">
          <Tabs.Tab value="native">{nativeLabel}</Tabs.Tab>
          <Tabs.Tab value="mbql">{t`MBQL`}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="native" className={S.panel}>
          {canRun ? (
            <NotebookNativePreview hideHeader />
          ) : (
            <Text c="text-secondary" p="lg">
              {hint}
            </Text>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="mbql" className={S.panel}>
          {canRun ? (
            <CodeEditor
              className={S.mbql}
              value={mbql}
              language="json"
              readOnly
            />
          ) : (
            <Text c="text-secondary" p="lg">
              {hint}
            </Text>
          )}
        </Tabs.Panel>
      </Tabs>
    </Box>
  );
};
