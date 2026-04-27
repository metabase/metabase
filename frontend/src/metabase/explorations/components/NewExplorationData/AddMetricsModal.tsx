import { t } from "ttag";

import type {
  MetricDimension,
  MetricOrMeasure,
} from "metabase/explorations/types";
import { Modal } from "metabase/ui";

export interface AddMetricsModalProps {
  opened: boolean;
  onClose: () => void;
  metrics: MetricOrMeasure[];
  setMetrics: (metrics: MetricOrMeasure[]) => void;
  dimensions: MetricDimension[];
  setDimensions: (dimensions: MetricDimension[]) => void;
}

export function AddMetricsModal({ opened, onClose }: AddMetricsModalProps) {
  return (
    <Modal title={t`Add metrics`} opened={opened} onClose={onClose}>
      <div>{t`Add metrics`}</div>
    </Modal>
  );
}
