import { useMemo } from "react";
import { t } from "ttag";

import { canDownloadResults } from "metabase/common/utils/dataset";
import { editQuestion, openEventsSidebar } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { transformSdkQuestion } from "metabase/embedding-sdk/lib/transform-question";
import type {
  DashCardMenuItem,
  DashboardCardCustomMenuItem,
} from "metabase/embedding-sdk/types/plugins";
import { useDispatch } from "metabase/redux";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId, Dataset } from "metabase-types/api";

import { canEditQuestion } from "./utils";

type DashCardMenuItemsProps = {
  dashcardId: DashCardId;
  question: Question;
  result: Dataset;
  isDownloadingData: boolean;
  onDownload: () => void;
  onEditVisualization?: () => void;
  canEdit?: boolean;
  withTimelineEvents?: boolean;
};
export const DashCardMenuItems = ({
  dashcardId,
  question,
  result,
  isDownloadingData,
  onDownload,
  onEditVisualization,
  canEdit,
  withTimelineEvents = false,
}: DashCardMenuItemsProps) => {
  const dispatch = useDispatch();

  const {
    dashcardMenu,
    onEditQuestion = (
      question: Question,
      mode: "query" | "view" | "notebook" = "notebook",
    ) => dispatch(editQuestion(question, mode)),
  } = useDashboardContext();
  // Unjustified type cast. FIXME
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

    if (withEditLink && canEdit && onEditVisualization) {
      items.push({
        key: "MB_EDIT_VISUALIZER_QUESTION",
        iconName: "lineandbar",
        label: t`Edit visualization`,
        onClick: onEditVisualization,
      });
    } else if (withEditLink && canEdit && canEditQuestion(question)) {
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

    if (withTimelineEvents) {
      items.push({
        key: "MB_TIMELINE_EVENTS",
        iconName: "calendar",
        label: t`Events`,
        onClick: () => dispatch(openEventsSidebar({ dashcardId })),
      });
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
    withTimelineEvents,
    dashcardId,
    dispatch,
    onEditVisualization,
    canEdit,
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
