import { c, t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { MoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import { useSetCollection } from "metabase/common/hooks";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import { Dashboards } from "metabase/entities/dashboards";
import type { State } from "metabase/redux/store";
import { Flex, Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import * as Urls from "metabase/urls";
import type { CollectionId, Dashboard } from "metabase-types/api";

import S from "./DashboardMoveModal.module.css";

function DashboardMoveModal({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) {
  const setCollection = useSetCollection();

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
        await setCollection(
          { model: "dashboard", id: dashboard.id },
          destination,
          {
            message: (
              <DashboardMoveToast
                collectionId={destination.id || ROOT_COLLECTION.id}
              />
            ),
          },
        );
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

export const DashboardMoveModalConnected = Dashboards.load({
  id: (_state: State, props: { params: { slug: string } }) =>
    Urls.extractCollectionId(props.params.slug),
})(DashboardMoveModal);
