import html2canvas from "html2canvas-pro";
import { useMemo, useState } from "react";
import { t } from "ttag";

/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { useSdkDashboardContext } from "embedding-sdk/components/public/dashboard/context";
/* eslint-disable-next-line no-restricted-imports -- deprecated sdk import */
import { transformSdkQuestion } from "embedding-sdk/lib/transform-question";
import { editQuestion } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import type { DashboardCardCustomMenuItem } from "metabase/embedding-sdk/types/plugins";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_DASHCARD_MENU } from "metabase/plugins";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DashCardId, Dataset } from "metabase-types/api";
// Note: 'rgba(0, 0, 0, 0)' is the browser's computed value for transparent backgrounds, not a design color.

import type { DashCardMenuItem } from "./dashcard-menu";
import { canDownloadResults, canEditQuestion } from "./utils";

// This is the browser's computed value for transparent backgrounds, not a design color.
// eslint-disable-next-line no-color-literals
const BROWSER_TRANSPARENT = "rgba(0, 0, 0, 0)";
const TRANSPARENT_LITERAL = color("transparent");
function getEffectiveBackgroundColor(element: HTMLElement): string | undefined {
  let el: HTMLElement | null = element;
  while (el) {
    const bg = window.getComputedStyle(el).backgroundColor;
    if (bg && bg !== BROWSER_TRANSPARENT && bg !== TRANSPARENT_LITERAL) {
      return bg;
    }
    el = el.parentElement;
  }
  // Try dashboard container
  const dashboard = document.querySelector(
    '[data-testid="dashboard"]',
  ) as HTMLElement | null;
  if (dashboard) {
    const dashBg = window.getComputedStyle(dashboard).backgroundColor;
    if (
      dashBg &&
      dashBg !== BROWSER_TRANSPARENT &&
      dashBg !== TRANSPARENT_LITERAL
    ) {
      return dashBg;
    }
  }
  // If still transparent, return undefined so html2canvas uses the real rendered background
  return undefined;
}

type DashCardMenuItemsProps = {
  question: Question;
  result: Dataset;
  isDownloadingData: boolean;
  onDownload: () => void;
  onEditVisualization?: () => void;
  dashcardId?: DashCardId;
  cardRootRef?: React.RefObject<HTMLElement>;
};
export const DashCardMenuItems = ({
  question,
  result,
  isDownloadingData,
  onDownload,
  onEditVisualization,
  dashcardId,
  cardRootRef,
}: DashCardMenuItemsProps) => {
  const dispatch = useDispatch();
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

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
      // Add Copy as image menu item after Download results
      if (cardRootRef?.current) {
        items.push({
          key: "MB_COPY_AS_IMAGE",
          iconName: "clipboard",
          label: copied ? t`Copied!` : copying ? t`Copying…` : t`Copy as image`,
          onClick: async () => {
            setCopying(true);
            try {
              const effectiveBg = getEffectiveBackgroundColor(
                cardRootRef.current!,
              );
              const options: any = {
                useCORS: true,
                logging: false,
                scale: window.devicePixelRatio || 1,
              };
              if (effectiveBg !== undefined) {
                options.backgroundColor = effectiveBg;
              }
              const canvas = await html2canvas(cardRootRef.current!, options);
              canvas.toBlob(async (blob) => {
                if (blob) {
                  try {
                    await navigator.clipboard.write([
                      new window.ClipboardItem({
                        [blob.type]: blob,
                      }),
                    ]);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch (err) {
                    alert(
                      "Failed to copy image to clipboard. Your browser may not support this feature.",
                    );
                  }
                }
              }, "image/png");
            } finally {
              setCopying(false);
            }
          },
          disabled: copying,
        });
      }
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
    cardRootRef,
    copied,
    copying,
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
