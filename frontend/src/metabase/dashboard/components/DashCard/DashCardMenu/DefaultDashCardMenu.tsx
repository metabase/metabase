import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useMemo, useState } from "react";

import CS from "metabase/css/core/index.css";
import type {
  DashboardCardCustomMenuItem,
  DashboardCardMenuObject,
  DashcardMenuItems,
} from "metabase/dashboard/context/types/dashcard-menu";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useUserKeyValue } from "metabase/hooks/use-user-key-value";
import { useStore } from "metabase/lib/redux";
import { exportFormatPng, exportFormats } from "metabase/lib/urls";
import { isJWT } from "metabase/lib/utils";
import { isUuid } from "metabase/lib/uuid";
import { PLUGIN_DASHCARD_MENU } from "metabase/plugins";
import { QuestionDownloadWidget } from "metabase/query_builder/components/QuestionDownloadWidget";
import { useDownloadData } from "metabase/query_builder/components/QuestionDownloadWidget/use-download-data";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import { canSavePng } from "metabase/visualizations";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type { Dataset } from "metabase-types/api";

import { DownloadMenuItem } from "./components/DownloadMenuItem";
import { EditLinkMenuItem } from "./components/EditLinkMenuItem";
import { EditVisualizationMenuItem } from "./components/EditVisualizationMenuItem";
import { UnderlyingQuestionMenuItem } from "./components/UnderlyingQuestionMenuItem";
import type { UseDashcardMenuItemsProps } from "./types";

const BASE_MENU_KEYS = [
  "edit-visualization",
  "edit-link",
  "download",
  "metabot",
  "view-underlying-question",
] as const;

function renderBaseMenuItems({
  dashcardMenu,
  question,
  dashboard,
  dashcard,
  series,
  onEditVisualization,
  isDownloadingData,
  onDownload,
}: { dashcardMenu: DashboardCardMenuObject } & UseDashcardMenuItemsProps) {
  return (
    <>
      {BASE_MENU_KEYS.flatMap((key) => {
        const rule = dashcardMenu?.[key];
        const shouldShow =
          typeof rule === "function"
            ? rule({ dashboard, dashcard, question, series })
            : rule;
        if (!shouldShow) {
          return [];
        }
        return (
          {
            "edit-visualization": (
              <EditVisualizationMenuItem
                key="edit-visualization"
                series={series}
                dashcard={dashcard}
                onEditVisualization={onEditVisualization}
              />
            ),
            "edit-link": (
              <EditLinkMenuItem key="edit-link" question={question} />
            ),
            download: (
              <DownloadMenuItem
                key="download"
                isDownloadingData={isDownloadingData}
                onDownload={onDownload}
              />
            ),
            metabot: (
              <PLUGIN_DASHCARD_MENU.dashcardMenuItem
                key="metabot"
                dashcardId={dashcard.id}
              />
            ),
            "view-underlying-question": (
              <UnderlyingQuestionMenuItem
                key="view-underlying-question"
                series={series}
                dashcard={dashcard}
              />
            ),
          } satisfies Record<DashcardMenuItems, ReactNode>
        )[key];
      })}
    </>
  );
}

function renderCustomMenuItems({
  dashcardMenu,
  question,
  dashboard,
  dashcard,
  series,
}: {
  dashcardMenu: DashboardCardMenuObject;
} & UseDashcardMenuItemsProps) {
  return (dashcardMenu?.customItems ?? []).map(
    (item: DashboardCardCustomMenuItem) => {
      const {
        label,
        color,
        leftSection,
        iconName,
        rightSection,
        onClick,
        closeMenuOnClick,
        disabled,
      } =
        typeof item === "function"
          ? item({ question, dashboard, dashcard, series })
          : item;

      return (
        <Menu.Item
          key={`MB_CUSTOM_${label}`}
          color={color}
          leftSection={leftSection ?? <Icon name={iconName} />}
          rightSection={rightSection}
          onClick={onClick}
          closeMenuOnClick={closeMenuOnClick}
          disabled={disabled}
        >
          {label}
        </Menu.Item>
      );
    },
  );
}

export const DefaultDashCardMenu = ({
  dashcardMenu,
  question,
  dashboard,
  dashcard,
  series,
  onEditVisualization,
}: {
  dashcardMenu: DashboardCardMenuObject;
} & UseDashcardMenuItemsProps) => {
  const store = useStore();

  const [menuView, setMenuView] = useState<string | null>(null);
  const [isOpen, { close, toggle }] = useDisclosure(false, {
    onClose: () => setMenuView(null),
  });

  const token = useMemo(
    () =>
      dashcard && isJWT(dashcard.dashboard_id)
        ? String(dashcard.dashboard_id)
        : undefined,
    [dashcard],
  );
  const uuid = useMemo(
    () =>
      dashcard && isUuid(dashcard.dashboard_id)
        ? String(dashcard.dashboard_id)
        : undefined,
    [dashcard],
  );

  const canDownloadPng = question && canSavePng(question.display());
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

  const result = series[0] as unknown as Dataset;
  const [{ loading: isDownloadingData }, handleDownload] = useDownloadData({
    question,
    result,
    dashboardId: dashboard.id,
    dashcardId: dashcard.id,
    uuid,
    token,
    params: getParameterValuesBySlugMap(store.getState()),
  });

  return (
    <Menu position="bottom-end" opened={isOpen} onClose={close}>
      <Menu.Target>
        <ActionIcon
          className={cx({
            [SAVING_DOM_IMAGE_HIDDEN_CLASS]: true,
            [cx(CS.hoverChild, CS.hoverChildSmooth)]: !isOpen,
          })}
          onClick={toggle}
        >
          <Icon name="ellipsis" data-testid="dashcard-menu" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {menuView === "download" ? (
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
        ) : (
          <>
            {renderBaseMenuItems({
              dashcardMenu,
              question,
              dashboard,
              dashcard,
              series,
              onEditVisualization,
              isDownloadingData,
              onDownload: () => {
                setMenuView("download");
              },
            })}
            {renderCustomMenuItems({
              dashcardMenu,
              question,
              dashboard,
              dashcard,
              series,
            })}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};
