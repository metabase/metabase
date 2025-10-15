import cx from "classnames";
import { useState } from "react";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { ViewFooterDownloadWidget } from "metabase/query_builder/components/view/ViewFooter/ViewFooterDownloadWidget";
import {
  getFirstQueryResult,
  getIsTimeseries,
} from "metabase/query_builder/selectors";
import { getIsObjectDetail } from "metabase/query_builder/selectors/mode";
import { Group, Timeline, Image, Button, Icon, Text, Modal } from "metabase/ui";

import { ExecutionTime } from "../ExecutionTime";
import { QuestionLastUpdated } from "../QuestionLastUpdated/QuestionLastUpdated";
import QuestionRowCount from "../QuestionRowCount";
import QuestionTimelineWidget from "../QuestionTimelineWidget";
import S from "./RightViewFooterButtonGroup.module.css";
import { useGetCardSnapshotsQuery } from "metabase/api";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import dayjs from "dayjs";

export const RightViewFooterButtonGroup = () => {
  const isTimeseries = useSelector(getIsTimeseries);
  const result = useSelector(getFirstQueryResult);
  const card = useSelector((state) => state.qb.card);
  const isObjectDetail = useSelector(getIsObjectDetail);

  return (
    <Group wrap="nowrap" justify="right" className={S.Root}>
      {QuestionRowCount.shouldRender({
        result,
        isObjectDetail,
      }) && <QuestionRowCount />}
      {ExecutionTime.shouldRender({ result }) && (
        <ExecutionTime time={result.running_time} />
      )}
      <Group gap="sm" wrap="nowrap">
        {QuestionLastUpdated.shouldRender({ result }) && (
          <QuestionLastUpdated
            className={cx(CS.hide, CS.smShow)}
            result={result}
          />
        )}
        <ViewFooterDownloadWidget />
        {QuestionTimelineWidget.shouldRender({ isTimeseries }) && (
          <QuestionTimelineWidget className={cx(CS.hide, CS.smShow)} />
        )}
        <SnapshotTimeline cardId={card?.id} />
      </Group>
    </Group>
  );
};

const SnapshotTimeline = ({ cardId }: { cardId?: number | null }) => {
  const { data: snapshots } = useGetCardSnapshotsQuery(
    { cardId: cardId ?? 0 },
    { skip: !cardId },
  );
  const [opened, setOpened] = useState(false);

  if (!snapshots || snapshots.length === 0) {
    return null;
  }

  return (
    <>
      <Button variant="subtle" onClick={() => setOpened((o) => !o)}>
        <Icon name="snail" />
      </Button>
      <SnapshotSidebar snapshots={snapshots} isOpen={opened} onClose={() => setOpened(false)} />
    </>
  );
}

const SnapshotSidebar = ({ snapshots, onClose, isOpen }: { snapshots: any[]; onClose: () => void; isOpen: boolean }) => {

  const [detailOpen, setDetailOpen] = useState<string | null>(null);

  return (
    <Sidesheet title="Snapshots" onClose={onClose} isOpen={isOpen} size="sm">
      <Timeline bulletSize={24} lineWidth={2} active={99}>
        {snapshots?.map((snapshot) => (
          <Timeline.Item
            key={snapshot.id}
            title={<Text fw="bold" mb="md">{dayjs(snapshot.created_at).fromNow()}</Text>}
            bullet={<Icon name="snail" />}
          >
            <Image
              onClick={() => setDetailOpen(snapshot.url)}
              src={snapshot.url}
              style={{ maxWidth: '200px', maxHeight: '150px' }}
            />
          </Timeline.Item>
        ))}
      </Timeline>

      <ImageDetails url={detailOpen} onClose={() => setDetailOpen(null)} />
    </Sidesheet>
  )
}

const ImageDetails = ({ url, onClose }: { url?: string | null; onClose: ()=> void }) => {
  return (
    <Modal opened={!!url} onClose={onClose} withCloseButton={false}>
      <Image src={url} style={{ maxWidth: '100%', maxHeight: '80vh' }} />
    </Modal>
  );
};
