import type { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import type { ReactNode } from "react";

import S from "../extensions.module.css";

/**
 * Props passed to a block "shell" — the element that wraps a top-level block's
 * content and is responsible for any block-level chrome (e.g. document comment
 * and anchor menus).
 */
export interface BlockShellProps {
  node: NodeViewProps["node"];
  editor: NodeViewProps["editor"];
  getPos: NodeViewProps["getPos"];
  /**
   * When true the host wants block-level menus suppressed (e.g. the block is
   * rendered inside the comments editor rather than a document).
   */
  hideMenus?: boolean;
  children: ReactNode;
}

/**
 * A block shell renders the block's outer wrapper and decides what chrome (if
 * any) to attach around it. The editor primitive ships {@link DefaultBlockShell}
 * (no chrome); hosts such as documents inject their own shell via the block
 * extension options to add comment/anchor menus.
 */
export type BlockShellComponent = (props: BlockShellProps) => ReactNode;

/**
 * Default block wrapper used when the host does not inject a shell. Renders the
 * plain node wrapper with no document-specific menus.
 */
export const DefaultBlockShell = ({ node, children }: BlockShellProps) => (
  <NodeViewWrapper className={S.root} data-node-id={node.attrs._id}>
    {children}
  </NodeViewWrapper>
);

/**
 * Options shared by the custom block node views, allowing a host to configure
 * the block shell and editing context.
 */
export interface BlockNodeOptions {
  blockShell?: BlockShellComponent;
  editorContext?: "comments" | "document";
}
