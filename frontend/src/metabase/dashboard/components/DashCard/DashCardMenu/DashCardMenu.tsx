import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  canDownloadResults,
  canEditQuestion,
} from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import {
  type DashboardContextReturned,
  useDashboardContext,
} from "metabase/dashboard/context";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import { useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { ActionIcon, Icon, Menu, type MenuProps } from "metabase/ui";
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
          <Menu trigger="click-hover" shadow="md" position="right" width={200}>
            <Menu.Target>
              <Menu.Item
                fw="bold"
                styles={{
                  // styles needed to override the hover styles
                  // as hovering is bugged for submenus
                  // this'll be much better in v8
                  item: {
                    backgroundColor: "transparent",
                    color: "var(--mb-color-text-primary)",
                  },
                  itemSection: {
                    color: "var(--mb-color-text-primary)",
                  },
                }}
                leftSection={<Icon name="external" aria-hidden />}
                rightSection={<Icon name="chevronright" aria-hidden />}
              >
                {t`View question(s)`}
              </Menu.Item>
            </Menu.Target>
            <Menu.Dropdown data-testid="dashcard-menu-open-underlying-question">
              {openUnderlyingQuestionItems}
            </Menu.Dropdown>
          </Menu>
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
  // MLv2 doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  return (
    !isInternalQuery &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};
