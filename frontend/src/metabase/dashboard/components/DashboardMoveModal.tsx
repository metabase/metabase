import { c, t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { MoveModal } from "metabase/common/components/Pickers/MoveModal/MoveModal";
import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { useSetCollection } from "metabase/common/hooks";
import { Flex, Icon, Modal, Skeleton } from "metabase/ui";
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
            color={color("core-brand")}
          >
            {collection.name}
          </Link>
        ) : null
      }`}
    </Flex>
  );
};

export const DashboardMoveModalConnected = ({
  params,
  onClose,
}: {
  params: { slug?: string };
  onClose: () => void;
}) => {
  const id = Urls.extractCollectionId(params.slug);
  const { currentData: dashboard, error } = useGetDashboardQuery(
    id != null ? { id } : skipToken,
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (id == null) {
    return null;
  }

  if (!dashboard) {
    return <DashboardMoveModalSkeleton onClose={onClose} />;
  }

  return <DashboardMoveModal dashboard={dashboard} onClose={onClose} />;
};

/** Stands in for the collection picker modal while the dashboard loads. */
function DashboardMoveModalSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <Modal.Root opened onClose={onClose} yOffset="10dvh">
      <Modal.Overlay />
      <Modal.Content miw="min(920px, 80vw)" maw="80vw" h="80dvh">
        <Modal.Header px="1.5rem" py="1rem" bg="background_page-primary">
          <Modal.Title fz="lg">{t`Move dashboard to…`}</Modal.Title>
          <Modal.CloseButton size={21} pos="relative" top="1px" />
        </Modal.Header>
        <Modal.Body p={0}>
          <LoadingSkeleton px="1.5rem" gap="1.5rem">
            <Skeleton h={40} w={400} maw="100%" radius="md" />
            <ListSkeleton rows={8} w={300} />
          </LoadingSkeleton>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
