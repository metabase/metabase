import type { ReactNode } from "react";

import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Flex,
  type FlexProps,
  Modal,
  type ModalDensity,
  NO_ANIMATION_MODAL_PROPS,
} from "metabase/ui";

import {
  TimelineModalHeader,
  type TimelineModalHeaderProps,
} from "../TimelineModalHeader";

import S from "./TimelineModal.module.css";

export interface TimelineModalProps extends Partial<TimelineModalHeaderProps> {
  onClose: () => void;
  /** Defaults to `true`. */
  animated?: boolean;
  density?: ModalDensity;
  /** At least 36rem tall, with the body laid out for a scrolling list. */
  tall?: boolean;
  children: ReactNode;
}

/**
 * The modal every timeline modal renders in. Render it once and switch only
 * its children, so the modal stays in place while content loads.
 */
export const TimelineModal = ({
  title,
  collectionName,
  actions,
  onGoBack,
  onClose,
  animated = true,
  density,
  tall = false,
  children,
}: TimelineModalProps) => (
  <Modal.Root
    opened
    size="lg"
    density={density}
    classNames={tall ? { content: S.content, body: S.body } : undefined}
    onClose={onClose}
    {...(animated ? undefined : NO_ANIMATION_MODAL_PROPS)}
  >
    <Modal.Overlay />
    <Modal.Content>
      <TimelineModalHeader
        title={title}
        collectionName={collectionName}
        actions={actions}
        onGoBack={onGoBack}
      />
      <Modal.Body>{children}</Modal.Body>
    </Modal.Content>
  </Modal.Root>
);

/** A spinner, or the error, filling a `tall` `TimelineModal`. */
export const TimelineModalLoadingState = ({
  loading,
  error,
}: Pick<LoadingAndErrorWrapperProps, "loading" | "error">) => (
  <LoadingAndErrorWrapper
    className={S.loading}
    loading={loading}
    error={error}
  />
);

/** A list that scrolls between the header and footer of a `tall` `TimelineModal`. */
export const TimelineModalScrollArea = (props: FlexProps) => (
  <Flex className={S.scrollArea} {...props} />
);
