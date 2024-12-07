import { t } from "ttag";

import Card from "metabase/components/Card";
import { Box, Icon } from "metabase/ui";

import TabHintToastS from "./TabHintToast.module.css";

type Props = {
  className?: string;
  onClose: () => void;
};

export function TabHintToast({ className, onClose }: Props) {
  return (
    <Card className={`${className} ${TabHintToastS.ToastCard}`}>
      <Icon className={TabHintToastS.TabIcon} name="tab" />
      <Box
        component="span"
        className={TabHintToastS.ToastMessage}
      >{t`Use the tab key to navigate through settings and columns.`}</Box>
      <Icon
        className={TabHintToastS.CloseIcon}
        name="close"
        size={12}
        onClick={onClose}
      />
    </Card>
  );
}
