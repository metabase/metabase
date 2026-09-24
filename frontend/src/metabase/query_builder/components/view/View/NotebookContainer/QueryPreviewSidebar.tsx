import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { Box, Text } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";

import { getQuestion } from "../../../../store/selectors";

import { NotebookNativePreview } from "./NotebookNativePreview";
import S from "./QueryPreviewSidebar.module.css";

// The native query behind the canvas, or a hint while there is none yet.
export const QueryPreviewSidebar = () => {
  const question = checkNotNull(useSelector(getQuestion));
  const canRun = Lib.canRun(question.query(), question.type());

  return (
    <Box
      component="aside"
      className={S.root}
      data-testid="query-preview-sidebar"
    >
      <Text fw={700} fz="lg" px="lg" pt="lg" pb="sm">
        {t`Query preview`}
      </Text>
      <div className={S.panel}>
        {canRun ? (
          <NotebookNativePreview hideHeader />
        ) : (
          <Text c="text-secondary" p="lg">
            {t`Wire a table into the result to see the query.`}
          </Text>
        )}
      </div>
    </Box>
  );
};
