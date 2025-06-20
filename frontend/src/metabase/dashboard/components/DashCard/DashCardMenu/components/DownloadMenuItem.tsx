import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

import type { UseDashcardMenuItemsProps } from "../types";

export const DownloadMenuItem = ({
  onDownload,
  isDownloadingData,
}: Pick<UseDashcardMenuItemsProps, "isDownloadingData" | "onDownload">) => (
  <Menu.Item
    leftSection={<Icon name="download" />}
    onClick={() => {
      onDownload?.();
    }}
    closeMenuOnClick={false}
  >
    {isDownloadingData ? t`Downloading…` : t`Download results`}
  </Menu.Item>
);
