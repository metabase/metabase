import styled from "@emotion/styled";
import MarkdownBase from "../Markdown";
import EditableText from "../EditableText";

export const EditableTextWithMarkdownRoot = styled.div(EditableText.Root);

export const Markdown = styled(MarkdownBase)`
  position: absolute;
`;
