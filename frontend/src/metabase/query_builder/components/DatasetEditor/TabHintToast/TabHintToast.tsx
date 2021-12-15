import React from "react";
import { t } from "ttag";

import {
  ToastCard,
  ToastMessage,
  TabIcon,
  CloseIcon,
} from "./TabHintToast.styled";

export function TabHintToast() {
  return (
    <ToastCard>
      <TabIcon name="tab" size={14} />
      <ToastMessage>{t`Use the tab key to navigate through settings and columns.`}</ToastMessage>
      <CloseIcon name="close" size={12} />
    </ToastCard>
  );
}
