import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { editQuestion } from "metabase/dashboard/actions";
import { getParameterValuesBySlugMap } from "metabase/dashboard/selectors";
import { useDispatch, useStore } from "metabase/lib/redux";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { QueryDownloadPopover } from "metabase/query_builder/components/QueryDownloadPopover";
import { useDownloadData } from "metabase/query_builder/components/QueryDownloadPopover/use-download-data";
import {
  ActionIcon,
  Icon,
  type IconName,
  Menu,
  type MenuItemProps,
} from "metabase/ui";
import { SAVING_DOM_IMAGE_HIDDEN_CLASS } from "metabase/visualizations/lib/save-chart-image";
import type Question from "metabase-lib/v1/Question";
import InternalQuery from "metabase-lib/v1/queries/InternalQuery";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  VisualizationSettings,
} from "metabase-types/api";

interface DashCardMenuProps {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid?: string;
  token?: string;
  visualizationSettings?: VisualizationSettings;
}

export type DashCardMenuItem = {
  iconName: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
} & MenuItemProps;

export const DashCardMenu = ({
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
}: DashCardMenuProps) => {
  const store = useStore();
  const dispatch = useDispatch();

  const [{ loading }, handleDownload] = useDownloadData({
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

  const menuItems = useMemo(() => {
    const items: DashCardMenuItem[] = [];
    if (canEditQuestion(question)) {
      items.push({
        iconName: "pencil",
        label: t`Edit question`,
        onClick: () => dispatch(editQuestion(question)),
      });
    }

    if (canDownloadResults(result)) {
      items.push({
        iconName: "download",
        label: loading ? t`Downloading…` : t`Download results`,
        onClick: () => setMenuView("download"),
        disabled: loading,
        closeMenuOnClick: false,
      });
    }

    return items;
  }, [question, result, dispatch, loading]);

  const getDropdownContent = () => {
    if (menuView === "download") {
      return (
        <QueryDownloadPopover
          question={question}
          result={result}
          onDownload={opts => {
            close();
            handleDownload(opts);
          }}
        />
      );
    }
    return (
      <>
        {menuItems.map(item => (
          <Menu.Item
            key={item.label}
            fw="bold"
            icon={<Icon name={item.iconName} />}
            {...item}
          >
            {item.label}
          </Menu.Item>
        ))}
      </>
    );
  };

  return (
    <Menu offset={4} position="bottom-end" opened={isOpen} onClose={close}>
      <Menu.Target>
        <ActionIcon
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

      <Menu.Dropdown>{getDropdownContent()}</Menu.Dropdown>
    </Menu>
  );
};

interface QueryDownloadWidgetOpts {
  question: Question;
  result?: Dataset;
  isXray?: boolean;
  isEmbed: boolean;
  /** If public sharing or static/public embed */
  isPublicOrEmbedded?: boolean;
  isEditing: boolean;
}

const canEditQuestion = (question: Question) => {
  return question.canWrite() && question.canRunAdhocQuery();
};

const canDownloadResults = (result?: Dataset) => {
  return (
    result != null &&
    !result.error &&
    PLUGIN_FEATURE_LEVEL_PERMISSIONS.canDownloadResults(result)
  );
};

DashCardMenu.shouldRender = ({
  question,
  result,
  isXray,
  isEmbed,
  isPublicOrEmbedded,
  isEditing,
}: QueryDownloadWidgetOpts) => {
  // Do not remove this check until we completely remove the old code related to Audit V1!
  // MLv2 doesn't handle `internal` queries used for Audit V1.
  const isInternalQuery = InternalQuery.isDatasetQueryType(
    question.datasetQuery(),
  );

  if (isEmbed) {
    return isEmbed;
  }
  return (
    !isInternalQuery &&
    !isPublicOrEmbedded &&
    !isEditing &&
    !isXray &&
    (canEditQuestion(question) || canDownloadResults(result))
  );
};
