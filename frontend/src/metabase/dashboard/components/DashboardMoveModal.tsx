import { c, t } from "ttag";
import _ from "underscore";

import { useGetCollectionQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { MoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Dashboards } from "metabase/entities/dashboards";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type { CollectionId, Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import S from "./DashboardMoveModal.module.css";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

function DashboardMoveModal({
  dashboard,
  onClose,
  setDashboardCollection,
}: {
  dashboard: Dashboard;
  onClose: () => void;
  setDashboardCollection: (
    source: { id: DashboardId },
    destination: { id: CollectionId },
    options: any,
  ) => void;
}) {
  return (
    <MoveModal
      title={t`Move dashboard to…`}
      onClose={onClose}
      canMoveToDashboard={false}
      movingItem={{
        ...dashboard,
        collection: {
          id: dashboard.collection?.id || "root",
          name: dashboard.collection?.name || "",
          namespace: dashboard.collection?.namespace,
        }, // parent collection info
        model: "dashboard",
      }}
      onMove={async (destination) => {
        await setDashboardCollection({ id: dashboard.id }, destination, {
          notify: {
            message: (
              <DashboardMoveToast
                collectionId={destination.id || ROOT_COLLECTION.id}
              />
            ),
          },
        });
        onClose();
      }}
    />
  );
}

const DashboardMoveToast = ({
  collectionId,
}: {
  collectionId: CollectionId;
}) => {
  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  return (
    <Flex align="center">
      <Icon
        name="collection"
        style={{ marginInlineEnd: "0.25rem" }}
        c="text-primary-inverse"
      />
      {c("{0} is a location where the dashboard was moved to")
        .jt`Dashboard moved to ${
        collection ? (
          <Link
            key="link"
            className={S.CollectionLink}
            to={Urls.collection(collection)}
            style={{ marginInlineStart: ".25em" }}
            color={color("brand")}
          >
            {collection.name}
          </Link>
        ) : null
      }`}
    </Flex>
  );
};

export const DashboardMoveModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (_state: State, props: { params: { slug: string } }) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(DashboardMoveModal);
