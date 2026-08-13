import { useMemo } from "react";

import { getGuestEmbedFilteredParameters } from "embedding-sdk-bundle/lib/get-guest-embed-filtered-parameters";
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
  const { withDownloads, parameterValues } = useSdkQuestionContext();
  const { token } = useEmbeddingEntityContext();

  const visualizationSettings = useMemo(
    () =>
      getComputedSettingsForSeries([
        { card: question.card(), data: result.data },
      ]),
    [question, result],
  );

  // For Guest Embeds, downloads must honor the active editable filter state
  // (EMB-1549). The `params` slug-keyed map mirrors what `runQuestionQuerySdk`
  // sends for live results.
  const params = useMemo(
    () => getGuestEmbedFilteredParameters(question, parameterValues),
    [question, parameterValues],
  );

  const [, handleDownload] = useDownloadData({
    question,
    result,
    token,
    params,
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
