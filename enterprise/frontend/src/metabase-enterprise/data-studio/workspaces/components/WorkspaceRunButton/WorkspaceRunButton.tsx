import { RunButton } from "metabase-enterprise/transforms/components/RunButton";
import type {
  TransformId,
  TransformJobId,
  TransformRun,
} from "metabase-types/api";

type WorkspaceRunButtonProps = {
  id: TransformId | TransformJobId | undefined;
  run: TransformRun | null | undefined;
  isDisabled?: boolean;
  allowCancellation?: boolean;
  onRun: () => void;
  onCancel?: () => void;
};

// A workspace-friendly wrapper that avoids showing the "recent success" state
export function WorkspaceRunButton({ run, ...rest }: WorkspaceRunButtonProps) {
  const activeRun =
    run?.status === "started" || run?.status === "canceling" ? run : null;

  return <RunButton run={activeRun} {...rest} />;
}
