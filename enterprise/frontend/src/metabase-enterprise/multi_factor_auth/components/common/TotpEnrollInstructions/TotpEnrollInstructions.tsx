import QRCode from "react-qr-code";
import { t } from "ttag";

import { Box, Center, Stack } from "metabase/ui";

import { CopyableCodeBlock } from "../CopyableCodeBlock";

const QR_CODE_SIZE = 180;

type TotpEnrollInstructionsProps = {
  otpauthUri: string;
  secret: string;
};

/**
 * Renders a fragment, not a Stack — every consumer already wraps its contents in one, so this keeps
 * these blocks as direct flex children and preserves the surrounding spacing.
 */
export function TotpEnrollInstructions({
  otpauthUri,
  secret,
}: TotpEnrollInstructionsProps) {
  return (
    <>
      <Stack gap="sm">
        <Box>{t`Scan this QR code with an authenticator app:`}</Box>
        <Center>
          {/* white background so the code stays scannable in dark mode */}
          <Box bg="white" p="md">
            <QRCode value={otpauthUri} size={QR_CODE_SIZE} />
          </Box>
        </Center>
      </Stack>
      <Stack gap="sm">
        <Box>{t`Or enter this key in the app manually:`}</Box>
        <CopyableCodeBlock codes={[secret]} />
      </Stack>
    </>
  );
}
