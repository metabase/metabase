import { t } from "ttag";

import {
  ToastCard,
  ToastMessage,
  TabIcon,
  CloseIcon,
} from "./TabHintToast.styled";

type Props = {
  className?: string;
  onClose: () => void;
};

export function TabHintToast({ className, onClose }: Props) {
  return (
    <ToastCard className={className}>
      <TabIcon name="tab" size={14} />
      <ToastMessage>{t`Use the tab key to navigate through settings and columns.`}</ToastMessage>
      <CloseIcon name="close" size={12} onClick={onClose} />
    </ToastCard>
  );
}
