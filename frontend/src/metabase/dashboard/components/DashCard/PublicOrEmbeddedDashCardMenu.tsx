import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { QuestionDownloadWidget } from "metabase/common/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/common/components/QuestionDownloadWidget/use-download-data";
import { useDashboardContext } from "metabase/dashboard/context";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useQuestionFromCard } from "metabase/metadata-store";
import { useStore } from "metabase/redux";
import { Icon, Menu } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";
import type { Dataset, QuestionDashboardCard } from "metabase-types/api";

import { DashCardMenuButton } from "./DashCardMenu/DashCardMenuButton";
import { getDashcardTokenId, getDashcardUuid } from "./dashcard-ids";

type PublicOrEmbeddedDashCardMenuProps = {
  result: Dataset;
  // Every caller gates on `isQuestionCard(dashcard.card)`, so a virtual
  // dashcard never reaches this menu.
  dashcard: QuestionDashboardCard;
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

  const buildQuestion = useQuestionFromCard();
  const question = useMemo(
    () => buildQuestion(dashcard.card),
    [dashcard.card, buildQuestion],
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
    <Menu
      closeOnEscape
      offset={4}
      onClose={close}
      opened={isOpen}
      position="bottom-end"
      trapFocus
    >
      <Menu.Target>
        <DashCardMenuButton
          onClick={toggle}
          data-testid="public-or-embedded-dashcard-menu"
        />
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
