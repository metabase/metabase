import { Box } from "metabase/ui";
import type { DocumentContent } from "metabase-types/api";

interface Props {
  disabled?: boolean;
  initialContent?: DocumentContent | null;
  onChange?: (content: DocumentContent) => void;
}

export const CommentEditor = ({
  disabled,
  initialContent,
  onChange,
}: Props) => <Box>TODO: implement me</Box>;
