import { t } from "ttag";

import {
  getNextRunParameters,
  getQuestion,
} from "metabase/query_builder/selectors";
import { NativeQueryPreview } from "metabase/querying/notebook/components/NativeQueryPreview";
import { useSelector } from "metabase/redux";
import { Modal } from "metabase/ui";
import { checkNotNull } from "metabase/utils/types";

export const PreviewQueryModal = ({
  onClose = () => undefined,
}: {
  onClose?: () => void;
}) => {
  const question = checkNotNull(useSelector(getQuestion));
  const parameters = useSelector(getNextRunParameters);

  return (
    <Modal opened onClose={onClose} title={t`Query preview`}>
      <NativeQueryPreview query={question.query()} parameters={parameters} />
    </Modal>
  );
};
