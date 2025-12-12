import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { usePublicDocumentContext } from "metabase/public/contexts/PublicDocumentContext";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";

type PublicDocumentCardMenuProps = {
  card: Card;
  dataset: Dataset;
};

export const PublicDocumentCardMenu = ({
  card,
  dataset,
}: PublicDocumentCardMenuProps) => {
  const { publicDocumentUuid } = usePublicDocumentContext();
  const [menuView, setMenuView] = useState<string | null>(null);
  const [isOpen, { close, toggle }] = useDisclosure(false, {
    onClose: () => {
      setMenuView(null);
    },
  });

  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(card, metadata),
    [card, metadata],
  );

  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question: question,
    result: dataset,
    documentUuid: checkNotNull(publicDocumentUuid),
  });

  return (
    <Menu
      withinPortal
      offset={4}
      position="bottom-end"
      opened={isOpen}
      onClose={close}
    >
      <Menu.Target>
        <ActionIcon
          size="xs"
          className={cx({
            [SAVING_DOM_IMAGE_HIDDEN_CLASS]: true,
          })}
          onClick={toggle}
          data-testid="public-document-card-menu"
          aria-label="ellipsis"
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {menuView === "downloads" ? (
          <QuestionDownloadWidget
            question={question}
            result={dataset}
            onDownload={async (opts) => {
              close();

              await handleDownload(opts);
            }}
          />
        ) : (
          <Menu.Item
            fw="bold"
            leftSection={<Icon name="download" aria-hidden />}
            aria-label={
              isDownloadingData ? t`Downloading…` : t`Download results`
            }
            disabled={isDownloadingData}
            closeMenuOnClick={false}
            onClick={() => {
              setMenuView("downloads");
            }}
          >
            {isDownloadingData ? t`Downloading…` : t`Download results`}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
