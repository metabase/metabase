import type { WindowModalProps } from "metabase/common/components/Modal/WindowModal";
import { WindowModal } from "metabase/common/components/Modal/WindowModal";
import { useDisableCommandPalette } from "metabase/ui/hooks/use-disable-command-palette";

export type ModalProps = WindowModalProps;

/** @deprecated use Modal from metabase/ui */
export const Modal = ({ isOpen = true, ...props }: ModalProps) => {
  useDisableCommandPalette({ disabled: isOpen });
  return <WindowModal isOpen={isOpen} {...props} />;
};
