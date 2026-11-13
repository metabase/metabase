import type { ReactNode } from "react";
import { t } from "ttag";

import { Alert, Button, Icon, Modal, Stack } from "metabase/ui";

type ImpersonationNoticeProps = {
  description: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

export const ImpersonationNotice = ({
  description,
  children,
  onClose,
}: ImpersonationNoticeProps) => (
  <>
    <Stack gap="xl">
      {description}
      <Alert size="compact" icon={<Icon name="warning" />} color="warning">
        {children}
      </Alert>
    </Stack>

    <Modal.Footer>
      <Button type="button" onClick={onClose}>{t`Close`}</Button>
    </Modal.Footer>
  </>
);
