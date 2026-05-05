import { useMemo } from "react";

import {
  QuestionDownloadWidget,
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/common/components/QuestionDownloadWidget";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import type { StackProps } from "metabase/ui";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import { useSdkQuestionContext } from "../../context";

// TODO: Add props for formatting, file type, etc
/**
 * @expand
 * @category InteractiveQuestion
 */
export type DownloadWidgetProps = StackProps;

const DownloadWidgetInner = ({
  question,
  result,
  ...rest
}: DownloadWidgetProps &
  Pick<UseDownloadDataParams, "question" | "result">) => {
  const { withDownloads } = useSdkQuestionContext();
  const { token } = useEmbeddingEntityContext();

  const visualizationSettings = useMemo(
    () =>
      getComputedSettingsForSeries([
        { card: question.card(), data: result.data },
      ]),
    [question, result],
  );

  const [, handleDownload] = useDownloadData({
    question,
    result,
    token,
    visualizationSettings,
  });

  return (
    <QuestionDownloadWidget
      question={question}
      result={result}
      onDownload={handleDownload}
      p="md"
      disabled={!withDownloads}
      {...rest}
    />
  );
};

/**
 * Provides a UI widget for downloading data in different formats (`CSV`, `XLSX`, `JSON`, and `PNG` depending on the visualization).
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const DownloadWidget = (props: DownloadWidgetProps) => {
  const { question, queryResults } = useSdkQuestionContext();
  const [result] = queryResults ?? [];

  if (!question || !result) {
    return null;
  }

  return <DownloadWidgetInner question={question} result={result} {...props} />;
};
