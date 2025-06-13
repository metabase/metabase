import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import type { StackProps } from "metabase/ui";

import { useQuestionContext } from "../../context";

// TODO: Add props for formatting, file type, etc
/**
 * @expand
 * @category Question
 */
export type QuestionDownloadWidgetProps = StackProps;

const DownloadWidgetInner = ({
  question,
  result,
  ...rest
}: QuestionDownloadWidgetProps &
  Pick<UseDownloadDataParams, "question" | "result">) => {
  const { withDownloads } = useQuestionContext();
  const [, handleDownload] = useDownloadData({
    question,
    result,
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
 * @category Question
 * @param props
 */
export const DownloadWidget = (props: QuestionDownloadWidgetProps) => {
  const { question, queryResults } = useQuestionContext();
  const [result] = queryResults ?? [];

  if (!question || !result) {
    return null;
  }

  return <DownloadWidgetInner question={question} result={result} {...props} />;
};
