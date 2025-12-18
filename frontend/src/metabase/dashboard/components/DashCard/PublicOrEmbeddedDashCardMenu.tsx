import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useSelector, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { getMetadata } from "metabase/selectors/metadata";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import Question from "metabase-lib/v1/Question";
import type { DashboardCard, Dataset } from "metabase-types/api";

import { getDashcardTokenId, getDashcardUuid } from "./dashcard-ids";

type PublicOrEmbeddedDashCardMenuProps = {
  result: Dataset;
  dashcard: DashboardCard;
};

export const PublicOrEmbeddedDashCardMenu = ({
  result,
  dashcard,
}: PublicOrEmbeddedDashCardMenuProps) => {
  const store = useStore();
  const token = getDashcardTokenId(dashcard);
  const uuid = getDashcardUuid(dashcard);
  const { dashboard, dashboardId } = useDashboardContext();

  const [menuView, setMenuView] = useState<string | null>(null);
  const [isOpen, { close, toggle }] = useDisclosure(false, {
    onClose: () => {
      setMenuView(null);
    },
  });

  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => new Question(dashcard.card, metadata),
    [dashcard.card, metadata],
  );

  // by the time we reach this code,  dashboardId really should not be null.
  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question: question,
    result,
    // dashboardId can be an entityId and the download endpoint expects a numeric id
    dashboardId: checkNotNull(dashboard?.id ?? dashboardId),
    dashcardId: dashcard.id,
    uuid,
    token,
    params: getParameterValuesBySlugMap(store.getState()),
  });

  return (
    <Menu offset={4} position="bottom-end" opened={isOpen} onClose={close}>
      <Menu.Target>
        <ActionIcon
          size="xs"
          className={cx({
            [SAVING_DOM_IMAGE_HIDDEN_CLASS]: true,
          })}
          onClick={toggle}
          data-testid="public-or-embedded-dashcard-menu"
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        {menuView === "downloads" ? (
          <QuestionDownloadWidget
            question={question}
            result={result}
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
