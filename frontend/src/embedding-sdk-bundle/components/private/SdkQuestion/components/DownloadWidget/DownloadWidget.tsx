import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import type { StackProps } from "metabase/ui";

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

  const [, handleDownload] = useDownloadData({
    question,
    result,
    token,
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
