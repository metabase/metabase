import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import type { StackProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";

// TODO: Add props for formatting, file type, etc
/**
 * @category InteractiveQuestion
 * @remarks
 * Uses [Mantine Stack props](https://v7.mantine.dev/core/stack/?t=props) under the hood
 */
export type InteractiveQuestionDownloadWidgetProps = StackProps;

const DownloadWidgetInner = ({
  question,
  result,
  ...rest
}: InteractiveQuestionDownloadWidgetProps &
  Pick<UseDownloadDataParams, "question" | "result">) => {
  const { withDownloads } = useInteractiveQuestionContext();
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

export const DownloadWidget = (
  props: InteractiveQuestionDownloadWidgetProps,
) => {
  const { question, queryResults } = useInteractiveQuestionContext();
  const [result] = queryResults ?? [];

  if (!question || !result) {
    return null;
  }

  return <DownloadWidgetInner question={question} result={result} {...props} />;
};
