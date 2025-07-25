import { Flex, Loader, Text } from "metabase/ui";

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
      <Loader size="lg" color="currentColor" />
      {message && <Text className={S.message}>{message}</Text>}
    </Flex>
  );
}
