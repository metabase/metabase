import { t } from "ttag";

import { Popover, type PopoverProps } from "metabase/ui";

import { useSdkQuestionContext } from "../../context";
import { SdkActionIcon } from "../util/SdkActionIcon";

import { DownloadWidget } from "./DownloadWidget";

/**
 * @expand
 * @category InteractiveQuestion
 */
export type InteractiveQuestionDownloadWidgetDropdownProps = PopoverProps;

/**
 * Provides a button that contains a dropdown that shows the `DownloadWidget`.
 *
 * @function
 * @category InteractiveQuestion
 * @param props
 */
export const DownloadWidgetDropdown = ({
  ...popoverProps
}: InteractiveQuestionDownloadWidgetDropdownProps) => {
  const { withDownloads } = useSdkQuestionContext();
  if (!withDownloads) {
    return null;
  }

  return (
    <Popover
      {...popoverProps}
      disabled={!withDownloads}
      floatingStrategy="fixed"
      withinPortal={false}
      position="bottom-end"
    >
      <Popover.Target>
        <SdkActionIcon
          tooltip={t`Download results`}
          icon="download"
          data-testid="question-download-widget-button"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DownloadWidget w="18rem" />
      </Popover.Dropdown>
    </Popover>
  );
};
