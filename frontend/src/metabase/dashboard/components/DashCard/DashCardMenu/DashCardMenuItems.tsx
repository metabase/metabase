import { useMemo } from "react";
import { t } from "ttag";

import type { DashCardCustomMenuItem } from "embedding-sdk";
import { useInteractiveDashboardContext } from "embedding-sdk/components/public/InteractiveDashboard/context";
import { editQuestion } from "metabase/dashboard/actions";
import type { DashCardMenuItem } from "metabase/dashboard/components/DashCard/DashCardMenu/DashCardMenu";
import { useDispatch } from "metabase/lib/redux";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dataset } from "metabase-types/api";

import { canDownloadResults, canEditQuestion } from "./utils";

type DashCardMenuItemsProps = {
  question: Question;
  result: Dataset;
  isDownloadingData: boolean;
  onDownload: () => void;
};
export const DashCardMenuItems = ({
  question,
  result,
  isDownloadingData,
  onDownload,
}: DashCardMenuItemsProps) => {
  const dispatch = useDispatch();

  const {
    plugins,
    onEditQuestion = (question, mode = "notebook") =>
      dispatch(editQuestion(question, mode)),
  } = useInteractiveDashboardContext();

  const dashcardMenuItems = plugins?.dashboard?.dashcardMenu as
    | DashCardCustomMenuItem
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

    if (withEditLink && canEditQuestion(question)) {
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

    if (customItems) {
      items.push(
        ...customItems.map(item => {
          const customItem =
            typeof item === "function"
              ? item({ question: question.card() })
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
  ]);

  return menuItems.map(item => (
    <Menu.Item
      fw="bold"
      {...item}
      key={item.key}
      icon={<Icon name={item.iconName} aria-hidden />}
    >
      {item.label}
    </Menu.Item>
  ));
};
