import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { isValidElement, useState } from "react";

/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import type { MetabasePluginsConfig } from "embedding-sdk";
/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { useInteractiveDashboardContext } from "embedding-sdk/components/public/InteractiveDashboard/context";
/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import CS from "metabase/css/core/index.css";
import {
  canDownloadResults,
  canEditQuestion,
} from "metabase/dashboard/components/DashCard/DashCardMenu/utils";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useUserKeyValue } from "metabase/hooks/use-user-key-value";
import { useStore } from "metabase/lib/redux";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import {
  ActionIcon,
  Icon,
  type IconName,
  Menu,
  type MenuItemProps,
} from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";
import { InternalQuery } from "metabase-lib/v1/queries/InternalQuery";
import type {
  DashCardId,
  DashboardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

import { DashCardMenuItems } from "./DashCardMenuItems";

interface DashCardMenuProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  visualizationSettings?: VisualizationSettings;
  downloadsEnabled: boolean;
}

export type DashCardMenuItem = {
  iconName: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
} & MenuItemProps;

function isDashCardMenuEmpty(plugins?: MetabasePluginsConfig) {
  const dashcardMenu = plugins?.dashboard?.dashboardCardMenu;

  if (!plugins || !dashcardMenu || typeof dashcardMenu !== "object") {
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
  dashboardId,
  dashcardId,
  uuid,
  token,
}: DashCardMenuProps) => {
  const store = useStore();
  const { plugins } = useInteractiveDashboardContext();
  const canDownloadPng = canSavePng(question.display());
  const formats = canDownloadPng
    ? [...exportFormats, exportFormatPng]
    : exportFormats;

  const { value: formatPreference, setValue: setFormatPreference } =
    useUserKeyValue({
      namespace: "last_download_format",
      key: "download_format_preference",
      defaultValue: {
        last_download_format: formats[0],
        last_table_download_format: exportFormats[0],
      },
    });

  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId,
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

  if (isDashCardMenuEmpty(plugins)) {
    return null;
  }

  const getMenuContent = () => {
    if (typeof plugins?.dashboard?.dashboardCardMenu === "function") {
      return plugins.dashboard.dashboardCardMenu({
        question: transformSdkQuestion(question),
      });
    }

    if (isValidElement(plugins?.dashboard?.dashboardCardMenu)) {
      return plugins.dashboard.dashboardCardMenu;
    }

    if (menuView === "download") {
      return (
        <QuestionDownloadWidget
          question={question}
          result={result}
          formatPreference={formatPreference}
          setFormatPreference={setFormatPreference}
          onDownload={(opts) => {
            close();
            handleDownload(opts);
          }}
        />
      );
    }

    return (
      <DashCardMenuItems
        question={question}
        result={result}
        isDownloadingData={isDownloadingData}
        onDownload={() => setMenuView("download")}
      />
    );
  };

  return (
    <Menu offset={4} position="bottom-end" opened={isOpen} onClose={close}>
      <Menu.Target>
        <ActionIcon
          size="xs"
          className={cx({
            [SAVING_DOM_IMAGE_HIDDEN_CLASS]: true,
            [cx(CS.hoverChild, CS.hoverChildSmooth)]: !isOpen,
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

interface ShouldRenderDashcardMenuProps {
  question: Question;
  result?: Dataset;
  isXray?: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isEditing: boolean;
  downloadsEnabled: boolean;
}

DashCardMenu.shouldRender = ({
  question,
  result,
  isXray,
  isPublicOrEmbedded,
  isEditing,
  downloadsEnabled,
}: ShouldRenderDashcardMenuProps) => {
  // Do not remove this check until we completely remove the old code related to Audit V1!
  // MLv2 doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  if (isPublicOrEmbedded) {
    return downloadsEnabled && !!result?.data && !result?.error;
  }
  return (
    !isInternalQuery &&
    !isEditing &&
    !isXray &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};
