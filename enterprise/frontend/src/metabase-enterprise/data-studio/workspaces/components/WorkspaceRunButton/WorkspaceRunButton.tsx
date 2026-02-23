import { RunButton } from "metabase/transforms/components/RunButton";
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

// A workspace-friendly wrapper that shows visual feedback during and after runs
export function WorkspaceRunButton({ run, ...rest }: WorkspaceRunButtonProps) {
  // Pass through active/completed run states for visual feedback
  // - started/canceling: show in-progress state
  // - succeeded/failed: show completion state (controlled by parent)
  const activeRun =
    run?.status === "started" ||
    run?.status === "canceling" ||
    run?.status === "succeeded" ||
    run?.status === "failed"
      ? run
      : null;

  return <RunButton run={activeRun} size="sm" {...rest} />;
}
