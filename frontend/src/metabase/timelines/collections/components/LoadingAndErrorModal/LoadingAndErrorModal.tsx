import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import S from "metabase/timelines/common/components/TimelineModal.module.css";
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
  <Modal
    opened
    size="lg"
    classNames={{ content: S.content, body: S.body }}
    onClose={onClose}
    {...NO_ANIMATION_MODAL_PROPS}
  >
    <Flex
      component={LoadingAndErrorWrapper}
      direction="column"
      flex="1 1 auto"
      loading={loading}
      error={error}
    />
  </Modal>
);
