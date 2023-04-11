import React from "react";
import { useAsyncFn } from "react-use";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import LoadingSpinner from "metabase/components/LoadingSpinner";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Dataset } from "metabase-types/api";
import Question from "metabase-lib/Question";
import QueryDownloadPopover from "../QueryDownloadPopover";

interface OwnProps {
  question: Question;
  result: Dataset;
  onDownload: (format: string) => Promise<void>;
}

type QueryDownloadWidgetProps = OwnProps;

const QueryDownloadWidget = ({
  question,
  result,
  onDownload,
}: QueryDownloadWidgetProps) => {
  const [{ loading }, handleDownload] = useAsyncFn(onDownload);

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick }) =>
        loading ? (
          <Tooltip tooltip={t`Downloading…`}>
            <LoadingSpinner size={18} />
          </Tooltip>
        ) : (
          <Tooltip tooltip={t`Download full results`}>
            <IconButtonWrapper data-testid="download-button" onClick={onClick}>
              <Icon name="download" size={20} />
            </IconButtonWrapper>
          </Tooltip>
        )
      }
      popoverContent={
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={handleDownload}
        />
      }
    />
  );
};

export default QueryDownloadWidget;
