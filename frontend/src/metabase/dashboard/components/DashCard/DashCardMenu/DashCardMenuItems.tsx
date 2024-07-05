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

export const DashCardMenuItems = ({
  question,
  result,
  loading,
  onDownload,
}: {
  question: Question;
  result: Dataset;
  loading: boolean;
  onDownload: () => void;
}) => {
  const dispatch = useDispatch();

  const {
    plugins,
    onEditQuestion = question => dispatch(editQuestion(question)),
  } = useInteractiveDashboardContext();
  const dashcardMenuItems = plugins?.dashboard
    ?.dashcardMenu as DashCardCustomMenuItem;

  const showEditLink = dashcardMenuItems?.withEditLink ?? true;
  const showDownloads = dashcardMenuItems?.withDownloads ?? true;

  const menuItems = useMemo(() => {
    const items: (DashCardMenuItem & {
      key: string;
    })[] = [];

    if (showEditLink && canEditQuestion(question)) {
      items.push({
        key: "MB_EDIT_QUESTION",
        iconName: "pencil",
        label: t`Edit question`,
        onClick: () => onEditQuestion(question),
      });
    }

    if (showDownloads && canDownloadResults(result)) {
      items.push({
        key: "MB_DOWNLOAD_RESULTS",
        iconName: "download",
        label: loading ? t`Downloading…` : t`Download results`,
        onClick: onDownload,
        disabled: loading,
        closeMenuOnClick: false,
      });
    }

    dashcardMenuItems.customItems?.map(item => {
      const customItem = typeof item === "function" ? item({ question }) : item;
      items.push({
        ...customItem,
        key: `MB_CUSTOM_${customItem.label}`,
      });
    });

    return items;
  }, [
    loading,
    onDownload,
    onEditQuestion,
    dashcardMenuItems.customItems,
    question,
    result,
    showDownloads,
    showEditLink,
  ]);

  return menuItems.map(item => (
    <Menu.Item
      fw="bold"
      {...item}
      key={item.key}
      icon={<Icon name={item.iconName} />}
    >
      {item.label}
    </Menu.Item>
  ));
};
