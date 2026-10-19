import { type ModalProps, NO_ANIMATION_MODAL_PROPS } from "metabase/ui";

export interface TimelineModalTransitionProps {
  /** Whether the modal animates as it opens and closes. Defaults to `true`. */
  animated?: boolean;
}

/** Modal props for a timeline modal's `animated` setting */
export const getTimelineModalTransitionProps = (
  animated = true,
): Partial<ModalProps> | undefined =>
  animated ? undefined : NO_ANIMATION_MODAL_PROPS;
