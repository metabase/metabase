import { QueryDownloadPopover } from "metabase/query_builder/components/QueryDownloadPopover";
import {
  type UseDownloadDataParams,
  useDownloadData,
} from "metabase/query_builder/components/QueryDownloadPopover/use-download-data";

import { useInteractiveQuestionContext } from "../../context";

export interface DownloadWidgetProps {}

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
      {...rest}
    />
  );
};

export const DownloadWidget = (props: DownloadWidgetProps) => {
  const { question, queryResults } = useInteractiveQuestionContext();
  const [result] = queryResults ?? [];

  if (!question && !result) {
    return null;
  }

  return (
    <DownloadWidgetInner
      question={question}
      result={result}
      {...props}
    ></DownloadWidgetInner>
  );
};
