import { WorkspacePage as WorkspacePageComponent } from "../components/WorkspacePage";

interface WorkspacePageContainerProps {
  params: {
    id: string;
  };
}

export const WorkspacePage = ({ params }: WorkspacePageContainerProps) => {
  return <WorkspacePageComponent workspaceId={parseInt(params.id, 10)} />;
};
