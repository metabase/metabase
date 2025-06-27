import { useMemo } from "react";
import { t } from "ttag";

/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { useSdkDashboardContext } from "embedding-sdk/components/public/dashboard/context";
/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { editQuestion } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import type { DashboardCardCustomMenuItem } from "metabase/embedding-sdk/types/plugins";
import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_DASHCARD_MENU } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId, Dataset } from "metabase-types/api";

import type { DashCardMenuItem } from "./dashcard-menu";
import { canDownloadResults, canEditQuestion } from "./utils";

type DashCardMenuItemsProps = {
  question: Question;
  result: Dataset;
  isDownloadingData: boolean;
  onDownload: () => void;
  onEditVisualization?: () => void;
  dashcardId?: DashCardId;
};
export const DashCardMenuItems = ({
  question,
  result,
  isDownloadingData,
  onDownload,
  onEditVisualization,
  dashcardId,
}: DashCardMenuItemsProps) => {
  const dispatch = useDispatch();

  const {
    onEditQuestion = (question, mode = "notebook") =>
      dispatch(editQuestion(question, mode)),
  } = useSdkDashboardContext();

  const { dashcardMenu } = useDashboardContext();
  const dashcardMenuItems = dashcardMenu as
    | DashboardCardCustomMenuItem
    | undefined;

  const {
    customItems = [],
    withDownloads = true,
    withEditLink = true,
  } = dashcardMenuItems ?? {};

  const menuItems = useMemo(() => {
    const items: (DashCardMenuItem & {
      key: string;
    })[] = [];

    if (withEditLink && onEditVisualization) {
      items.push({
        key: "MB_EDIT_VISUALIZER_QUESTION",
        iconName: "lineandbar",
        label: t`Edit visualization`,
        onClick: onEditVisualization,
      });
    } else if (withEditLink && canEditQuestion(question)) {
      const type = question.type();
      if (type === "question") {
        items.push({
          key: "MB_EDIT_QUESTION",
          iconName: "pencil",
          label: t`Edit question`,
          onClick: () => onEditQuestion(question),
        });
      }
      if (type === "model") {
        items.push({
          key: "MB_EDIT_MODEL",
          iconName: "pencil",
          label: t`Edit model`,
          onClick: () => onEditQuestion(question, "query"),
        });
      }
      if (type === "metric") {
        items.push({
          key: "MB_EDIT_METRIC",
          iconName: "pencil",
          label: t`Edit metric`,
          onClick: () => onEditQuestion(question, "query"),
        });
      }
    }

    if (withDownloads && canDownloadResults(result)) {
      items.push({
        key: "MB_DOWNLOAD_RESULTS",
        iconName: "download",
        label: isDownloadingData ? t`Downloading…` : t`Download results`,
        onClick: onDownload,
        disabled: isDownloadingData,
        closeMenuOnClick: false,
      });
    }

    items.push(
      ...PLUGIN_DASHCARD_MENU.dashcardMenuItemGetters
        .map((itemGetter) => itemGetter(question, dashcardId, dispatch))
        .filter(isNotNull),
    );

    if (customItems) {
      items.push(
        ...customItems.map((item) => {
          const customItem =
            typeof item === "function"
              ? item({ question: transformSdkQuestion(question) })
              : item;

          return {
            ...customItem,
            key: `MB_CUSTOM_${customItem.label}`,
          };
        }),
      );
    }

    return items;
  }, [
    customItems,
    isDownloadingData,
    onDownload,
    onEditQuestion,
    question,
    result,
    withDownloads,
    withEditLink,
    onEditVisualization,
    dashcardId,
    dispatch,
  ]);

  return menuItems.map((item) => {
    const { iconName, key, ...rest } = item;

    return (
      <Menu.Item
        fw="bold"
        {...rest}
        key={key}
        leftSection={<Icon name={iconName} aria-hidden />}
        aria-label={item.label}
      >
        {item.label}
      </Menu.Item>
    );
  });
};
