import { Box } from "metabase/ui";
import type { DocumentContent } from "metabase-types/api";

interface Props {
  disabled?: boolean;
  initialContent?: DocumentContent | null;
  onChange?: (content: DocumentContent) => void;
}

/**
 * TODO: implement me
 *
 * This should be similar to enterprise/frontend/src/metabase-enterprise/documents/components/Editor/Editor.tsx
 * but without all the extensions. We just need simple extensions for basic formatting and links, and to be figured out what else.
 */
export const CommentEditor = ({
  disabled,
  initialContent,
  onChange,
}: Props) => {
  return <Box />;
};
