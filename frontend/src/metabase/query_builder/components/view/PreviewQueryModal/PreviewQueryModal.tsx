import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import {
  getNextRunParameters,
  getQuestion,
} from "metabase/query_builder/selectors";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { Modal } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";

export const PreviewQueryModal = ({
  onClose = () => undefined,
}: {
  onClose?: () => void;
}) => {
  const question = checkNotNull(useSelector(getQuestion));
  const parameters: UiParameter[] = useSelector(getNextRunParameters);

  return (
    <Modal opened onClose={onClose} title={t`Query preview`}>
      <NativeQueryPreview query={question.query()} parameters={parameters} />
    </Modal>
  );
};
