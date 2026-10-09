import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { trackMetricCreateStarted } from "metabase/common/data-studio/analytics";
import { canUserCreateQueries } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { setOpenModalWithProps } from "metabase/redux/ui";
import { useNavigate } from "metabase/router";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

import { PublishTableModal } from "../PublishTableModal";

export const CreateMenu = ({
  metricCollectionId,
  canWriteToMetricCollection,
  dataCollectionId,
  canWriteToDataCollection,
  dashboardCollectionId,
  canWriteToDashboardCollection,
  onNewDashboardClick,
}: {
  metricCollectionId?: CollectionId;
  canWriteToMetricCollection?: boolean;
  dataCollectionId?: CollectionId;
  canWriteToDataCollection?: boolean;
  dashboardCollectionId?: CollectionId;
  canWriteToDashboardCollection?: boolean;
  onNewDashboardClick: () => void;
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [
    showPublishTableModal,
    { close: closePublishTableModal, open: openPublishTableModal },
  ] = useDisclosure(false);

  const hasDataAccess = useSelector(canUserCreateQueries);
  const canCreateMetric =
    hasDataAccess && metricCollectionId && canWriteToMetricCollection;

  const canCreateDashboard =
    dashboardCollectionId && canWriteToDashboardCollection;

  const canCreateLibraryCollection =
    (dataCollectionId && canWriteToDataCollection) ||
    (metricCollectionId && canWriteToMetricCollection) ||
    canCreateDashboard;

  const collectionNamespaces: CollectionNamespace[] = [null];

  const initialCollectionId =
    (dataCollectionId && canWriteToDataCollection && dataCollectionId) ||
    (metricCollectionId && canWriteToMetricCollection && metricCollectionId) ||
    (canCreateDashboard && dashboardCollectionId) ||
    null;

  const menuItems = [
    <Menu.Item
      key="publish-table"
      leftSection={<FixedSizeIcon name="publish" />}
      onClick={openPublishTableModal}
    >
      {t`Published table`}
    </Menu.Item>,
    canCreateMetric && (
      <Menu.Item
        key="metric"
        component={ForwardRefLink}
        to={Urls.newDataStudioMetric({
          collectionId: metricCollectionId,
        })}
        leftSection={<FixedSizeIcon name="metric" />}
        onClickCapture={() => trackMetricCreateStarted("data_studio_library")}
      >
        {t`Metric`}
      </Menu.Item>
    ),
    canCreateDashboard && (
      <Menu.Item
        key="dashboard"
        leftSection={<FixedSizeIcon name="dashboard" />}
        onClick={onNewDashboardClick}
      >
        {t`Dashboard`}
      </Menu.Item>
    ),
    canCreateLibraryCollection && (
      <Menu.Item
        key="collection"
        leftSection={<FixedSizeIcon name="folder" />}
        onClick={() =>
          dispatch(
            setOpenModalWithProps({
              id: "collection",
              props: {
                initialCollectionId,
                namespaces: collectionNamespaces,
                pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
                showAuthorityLevelPicker: false,
              },
            }),
          )
        }
      >
        {t`Collection`}
      </Menu.Item>
    ),
  ].filter(Boolean);

  if (!menuItems.length) {
    return null;
  }

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
        </Menu.Target>
        <Menu.Dropdown>{menuItems}</Menu.Dropdown>
      </Menu>
      <PublishTableModal
        opened={showPublishTableModal}
        onClose={closePublishTableModal}
        onPublished={(table) => navigate(Urls.dataStudioTable(table.id))}
      />
    </>
  );
};

const LIBRARY_COLLECTION_PICKER_OPTIONS = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: false,
};
