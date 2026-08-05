import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { Button, Icon } from "metabase/ui";
import { useRunContentDiagnosticsScanMutation } from "metabase-enterprise/api";

export function DiagnosticsScanButton() {
  const dispatch = useDispatch();
  const [runScan, { isLoading: isScanning }] =
    useRunContentDiagnosticsScanMutation();

  const handleScan = async () => {
    try {
      const result = await runScan().unwrap();
      dispatch(
        addUndo({
          message: t`Scan complete — ${result.finding_count} findings`,
        }),
      );
    } catch {
      dispatch(addUndo({ message: t`Scan failed`, icon: "warning" }));
    }
  };

  return (
    <Button
      variant="default"
      leftSection={<Icon name="refresh" />}
      loading={isScanning}
      data-testid="content-diagnostics-scan-button"
      onClick={handleScan}
    >
      {t`Rescan`}
    </Button>
  );
}
