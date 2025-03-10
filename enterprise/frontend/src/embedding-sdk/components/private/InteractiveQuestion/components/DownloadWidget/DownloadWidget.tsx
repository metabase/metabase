import { QueryDownloadPopover } from "metabase/query_builder/components/QueryDownloadPopover";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/query_builder/components/QueryDownloadPopover/use-download-data";
import type { StackProps } from "metabase/ui";

import { useInteractiveQuestionContext } from "../../context";

// TODO: Add props for formatting, file type, etc
export interface DownloadWidgetProps extends StackProps {}

const DownloadWidgetInner = ({
  question,
  result,
  ...rest
}: DownloadWidgetProps &
  Pick<UseDownloadDataParams, "question" | "result">) => {
  const [, handleDownload] = useDownloadData({
    question,
    result,
  });

  if (!question || !result) {
    return null;
  }

  return (
    <QueryDownloadPopover
      question={question}
      result={result}
      onDownload={handleDownload}
      p="md"
      {...rest}
    />
  );
};

export const DownloadWidget = (props: DownloadWidgetProps) => {
  const { question, queryResults } = useInteractiveQuestionContext();
  const [result] = queryResults ?? [];

  if (!question || !result) {
    return null;
  }

  return <DownloadWidgetInner question={question} result={result} {...props} />;
};
