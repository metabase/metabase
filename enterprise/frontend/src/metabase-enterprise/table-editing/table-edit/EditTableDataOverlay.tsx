import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import { Flex, Text } from "metabase/ui";

import S from "./EditTableDataOverlay.module.css";

type EditTableDataOverlayProps = {
  message?: string;
  show?: boolean;
};

export function EditTableDataOverlay({
  show = true,
  message,
}: EditTableDataOverlayProps) {
  if (!show) {
    return null;
  }

  return (
    <Flex className={S.overlay}>
      <LoadingSpinner />
      {message && <Text className={S.message}>{message}</Text>}
    </Flex>
  );
}
