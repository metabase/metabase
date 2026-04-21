import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { QuestionDownloadWidget } from "metabase/common/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/common/components/QuestionDownloadWidget/use-download-data";
import { canDownloadResults } from "metabase/common/utils/dataset";
import { canEditQuestion } from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import {
  type DashboardContextReturned,
  useDashboardContext,
} from "metabase/dashboard/context";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import { ActionIcon, Icon, Menu, type MenuProps } from "metabase/ui";
import { useStore } from "metabase/utils/redux";
import { checkNotNull } from "metabase/utils/types";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";
import { InternalQuery } from "metabase-lib/v1/queries/InternalQuery";
import type { DashboardCard, Dataset } from "metabase-types/api";

import { getDashcardTokenId, getDashcardUuid } from "../dashcard-ids";

import { DashCardMenuItems } from "./DashCardMenuItems";

interface DashCardMenuProps {
  question: Question;
  result: Dataset;
  dashcard: DashboardCard;
  position?: MenuProps["position"];
  onEditVisualization?: () => void;
  openUnderlyingQuestionItems?: React.ReactNode;
  canEdit?: boolean;
}

function isDashCardMenuEmpty(
  dashcardMenu: DashboardContextReturned["dashcardMenu"],
) {
  if (typeof dashcardMenu !== "object") {
    return false;
  }

  return (
    dashcardMenu?.withDownloads === false &&
    dashcardMenu?.withEditLink === false &&
    !dashcardMenu?.customItems?.length
  );
}

export const DashCardMenu = ({
  question,
  result,
  dashcard,
  position = "bottom-end",
  onEditVisualization,
  openUnderlyingQuestionItems,
  canEdit,
}: DashCardMenuProps) => {
  const store = useStore();

  const token = useMemo(() => {
    return getDashcardTokenId(dashcard);
  }, [dashcard]);
  const uuid = useMemo(() => getDashcardUuid(dashcard), [dashcard]);
  const dashcardId = dashcard.id;
  const { dashboard, dashboardId, dashcardMenu, downloadsEnabled } =
    useDashboardContext();
  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    // dashboardId can be an entityId and the download endpoint expects a numeric id
    dashboardId: checkNotNull(dashboard?.id ?? dashboardId),
    dashcardId,
    uuid,
    token,
    params: getParameterValuesBySlugMap(store.getState()),
  });

  const [menuView, setMenuView] = useState<string | null>(null);
  const [isOpen, { close, toggle }] = useDisclosure(false, {
    onClose: () => {
      setMenuView(null);
    },
  });

  if (!dashboard || isDashCardMenuEmpty(dashcardMenu)) {
    return null;
  }

  if (typeof dashcardMenu === "function") {
    return dashcardMenu({
      question: transformSdkQuestion(question),
      dashcard,
      result,
      downloadsEnabled,
    });
  }

  const getMenuContent = () => {
    if (menuView === "download") {
      return (
        <QuestionDownloadWidget
          question={question}
          result={result}
          onDownload={async (opts) => {
            close();

            await handleDownload(opts);
          }}
        />
      );
    }

    return (
      <>
        <DashCardMenuItems
          dashcardId={dashcardId}
          question={question}
          result={result}
          isDownloadingData={isDownloadingData}
          onDownload={() => setMenuView("download")}
          onEditVisualization={onEditVisualization}
          canEdit={canEdit}
        />
        {openUnderlyingQuestionItems && (
          <Menu.Sub position="right" shadow="md">
            <Menu.Sub.Target>
              <Menu.Sub.Item
                fw="bold"
                leftSection={<Icon name="external" aria-hidden />}
              >
                {t`View question(s)`}
              </Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown
              data-testid="dashcard-menu-open-underlying-question"
              style={{ maxWidth: "15rem" }}
            >
              {openUnderlyingQuestionItems}
            </Menu.Sub.Dropdown>
          </Menu.Sub>
        )}
      </>
    );
  };

  return (
    <Menu offset={4} position={position} opened={isOpen} onClose={close}>
      <Menu.Target>
        <ActionIcon
          size="xs"
          className={cx({
            [SAVING_DOM_IMAGE_HIDDEN_CLASS]: true,
          })}
          onClick={toggle}
          data-testid="dashcard-menu"
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>{getMenuContent()}</Menu.Dropdown>
    </Menu>
  );
};

type ShouldRenderDashcardMenuProps = {
  question: Question | null;
  result?: Dataset;
} & Pick<DashboardContextReturned, "dashboard" | "dashcardMenu">;

DashCardMenu.shouldRender = ({
  question,
  dashboard,
  dashcardMenu,
  result,
}: ShouldRenderDashcardMenuProps) => {
  if (!question || !dashboard || dashcardMenu === null) {
    return null;
  }

  // Do not remove this check until we completely remove the old code related to Audit V1!
  // Lib doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  return (
    !isInternalQuery &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};
