import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import { MODAL_MIN_HEIGHT } from "metabase/timelines/common/constants";
import { Flex, Modal, NO_ANIMATION_MODAL_PROPS } from "metabase/ui";

type LoadingAndErrorModalProps = Pick<
  LoadingAndErrorWrapperProps,
  "loading" | "error"
> & {
  onClose: () => void;
};

/** A modal with a spinner while `loading`, or the `error` if loading failed */
export const LoadingAndErrorModal = ({
  loading,
  error,
  onClose,
}: LoadingAndErrorModalProps) => (
  <Modal opened size="lg" onClose={onClose} {...NO_ANIMATION_MODAL_PROPS}>
    <Flex
      component={LoadingAndErrorWrapper}
      direction="column"
      mih={MODAL_MIN_HEIGHT}
      loading={loading}
      error={error}
    />
  </Modal>
);
